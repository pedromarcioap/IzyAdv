/**
 * Shared primitives for every newsletter Edge Function.
 *
 * Security posture:
 *   - `serviceClient()` uses the service role key and MUST never be handed to a
 *     browser. It is only used after the caller has been authenticated and
 *     authorised by `requireAdmin()` (or by the worker secret for cron calls).
 *   - `requireAdmin()` resolves the role from `public.admin_profiles` through a
 *     user-scoped client, so RLS itself enforces that a caller can only read
 *     their own authorisation row. Roles are never read from user_metadata.
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';

export const SEND_QUEUE = 'newsletter_send';
export const DLQ = 'newsletter_send_dlq';

export type AdminRole = 'master_admin' | 'admin' | 'editor' | 'analyst' | 'viewer';

/** Roles allowed to mutate content (campaigns, subscribers, templates). */
export const WRITE_ROLES: AdminRole[] = ['master_admin', 'admin', 'editor'];
/** Roles allowed to read operational data (recipients, events, settings). */
export const READ_ROLES: AdminRole[] = ['master_admin', 'admin', 'editor', 'analyst'];

export const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-newsletter-worker-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
    });
}

export function handleOptions(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    return null;
}

export function errorResponse(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message, details: error.details ?? null }, error.status);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('unhandled error:', error);
    return json({ error: 'internal_error', message }, 500);
}

export function requireEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new HttpError(500, `variável de ambiente ausente: ${name}`);
    }
    return value;
}

export function serviceClient(): SupabaseClient {
    const url = requireEnv('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? requireEnv('SERVICE_ROLE_KEY');
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-application-name': 'newsletter-service' } },
    });
}

/** User-scoped client: every query runs under the caller's RLS context. */
function userClient(authorization: string): SupabaseClient {
    const url = requireEnv('SUPABASE_URL');
    const anonKey =
        Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
    return createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
    });
}

export interface AdminContext {
    userId: string;
    email: string | null;
    role: AdminRole;
    supabase: SupabaseClient;
}

/**
 * Authenticates the caller from the Authorization header and verifies that the
 * account holds one of `roles` in public.admin_profiles.
 *
 * A verified JWT is not enough on its own: the profile must exist and be active,
 * which is what stops a self-signup (inactive viewer) from calling the API.
 */
export async function requireAdmin(req: Request, roles: AdminRole[] = READ_ROLES): Promise<AdminContext> {
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization.toLowerCase().startsWith('bearer ')) {
        throw new HttpError(401, 'cabeçalho Authorization ausente');
    }

    const client = userClient(authorization);
    const { data: userData, error: userError } = await client.auth.getUser();

    if (userError || !userData?.user) {
        throw new HttpError(401, 'sessão inválida ou expirada');
    }

    // RLS restricts this read to the caller's own row.
    const { data: profile, error: profileError } = await client
        .from('admin_profiles')
        .select('role, is_active')
        .eq('user_id', userData.user.id)
        .maybeSingle();

    if (profileError) {
        throw new HttpError(403, 'não foi possível verificar as permissões', profileError.message);
    }

    if (!profile?.is_active) {
        throw new HttpError(403, 'conta sem acesso administrativo ativo');
    }

    const role = profile.role as AdminRole;
    if (!roles.includes(role)) {
        throw new HttpError(403, `perfil "${role}" não possui permissão para esta operação`);
    }

    return {
        userId: userData.user.id,
        email: userData.user.email ?? null,
        role,
        supabase: client,
    };
}

/**
 * Authorises a scheduled/worker call using a shared secret.
 * Returns true when the request carries the expected worker secret.
 */
export function isWorkerCall(req: Request): boolean {
    const expected = Deno.env.get('NEWSLETTER_WORKER_SECRET');
    if (!expected) return false;
    const provided =
        req.headers.get('x-newsletter-worker-secret') ?? req.headers.get('X-Newsletter-Worker-Secret');
    if (!provided) return false;

    // Constant-time-ish comparison to avoid trivially leaking the secret.
    if (provided.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
        diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
}

// ---------------------------------------------------------------------------
// Signed tokens (unsubscribe, confirm, link tracking)
// ---------------------------------------------------------------------------

function tokenSecret(): string {
    return Deno.env.get('NEWSLETTER_TOKEN_SECRET') ?? requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(value: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(tokenSecret()),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return toBase64Url(new Uint8Array(signature));
}

/** Returns "<payload>.<signature>" for an opaque payload (e.g. a recipient id). */
export async function signToken(payload: string): Promise<string> {
    return `${toBase64Url(new TextEncoder().encode(payload))}.${await hmac(payload)}`;
}

/** Verifies a token produced by signToken and returns the payload, or null. */
export async function verifyToken(token: string | null): Promise<string | null> {
    if (!token) return null;

    const separator = token.lastIndexOf('.');
    if (separator <= 0) return null;

    const encodedPayload = token.slice(0, separator);
    const signature = token.slice(separator + 1);

    let payload: string;
    try {
        const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
        payload = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    } catch {
        return null;
    }

    const expected = await hmac(payload);
    if (expected.length !== signature.length) return null;

    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
        diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0 ? payload : null;
}

// ---------------------------------------------------------------------------
// Miscellaneous helpers
// ---------------------------------------------------------------------------

export function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with a cap, used for send retries. */
export function backoffSeconds(attempt: number, base: number, cap = 3600): number {
    return Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), cap);
}

/**
 * HTML escaping.
 *
 * The entity text is assembled from a leading ampersand instead of being
 * written as a literal: an over-eager formatter rewrites `&` back to `&`,
 * which silently turns this function into a no-op and makes every interpolated
 * subscriber field an injection vector. Building the string here keeps the
 * behaviour verifiable.
 */
const HTML_ENTITIES: Record<string, string> = {
    '&': '&' + 'amp;',
    '<': '&' + 'lt;',
    '>': '&' + 'gt;',
    '"': '&' + 'quot;',
    "'": '&' + '#39;',
};

export function escapeHtml(value: string): string {
    return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export interface LogContext {
    [key: string]: unknown;
}

export function structuredLog(level: 'info' | 'warn' | 'error', message: string, ctx: LogContext = {}): void {
    const line = JSON.stringify({ level, message, at: new Date().toISOString(), ...ctx });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}
