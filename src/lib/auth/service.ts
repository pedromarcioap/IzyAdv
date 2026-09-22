/**
 * Supabase Auth data access.
 *
 * The rules this module exists to enforce:
 *
 *   1. Passwords are never read, stored, compared or logged by this application.
 *      `signInWithPassword` hands the secret to the Auth server, which compares
 *      it against the bcrypt hash (per-user salt, `$2a$…`) it keeps in
 *      `auth.users.encrypted_password`. Nothing here can produce a password
 *      hash, and nothing here keeps the plaintext after the call returns.
 *
 *   2. The session in local storage is treated as untrusted. Identity is taken
 *      from `getClaims()` (verified JWT) and confirmed with `getUser()`, which
 *      is the only call that detects a session revoked elsewhere.
 *
 *   3. Authorization (the role) is read from `public.admin_profiles`, never from
 *      `user_metadata`, and the browser copy is only for UI decisions. RLS is
 *      what actually protects the data.
 */

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AdminProfile, AdminRole } from '../../types/newsletter';
import { getSupabaseClient } from '../supabase';
import { AuthError, classifyAuthError, isSessionInvalidError, unconfiguredError, type AuthErrorLike } from './errors';
import { isKnownRole } from './roles';
import { normalizeEmail, type LoginCredentials } from './validation';
import type { AccessDenial, ActiveSession, AuthenticatedIdentity, LogoutScope, SignInOutcome } from './types';

export interface SessionSnapshot {
    userId: string;
    email: string;
    /** `session_id` claim; identifies this device among the user's sessions. */
    sessionId: string | null;
    /** Unix seconds. */
    expiresAt: number | null;
    accessToken: string | null;
}

export interface IdentityResolution {
    identity: AuthenticatedIdentity | null;
    denial: AccessDenial | null;
}

export interface SessionsListing {
    sessions: ActiveSession[];
    /** Set when the introspection RPC is not deployed in this environment. */
    unavailableReason?: string;
}

export const PROFILE_PROMOTION_HINT = `-- Conceda acesso a um administrador de contas (SQL Editor / supabase db query):
insert into public.admin_profiles (user_id, email, full_name, role, is_active, accepted_at)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'name', u.email), 'master_admin', true, now()
  from auth.users u
 where lower(u.email) = lower('<email-da-conta>')
on conflict (user_id) do update
   set role = excluded.role, is_active = true, accepted_at = now();`;

function client(): SupabaseClient {
    const supabase = getSupabaseClient();
    if (!supabase) throw unconfiguredError();
    return supabase;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Decodes a JWT payload **for display only** (session id, expiry). Nothing here
 * is an authorization decision: the payload is base64, not a verified claim.
 * `getClaims()` / `getUser()` remain the verification path.
 */
export function decodeJwtPayloadForDisplay(accessToken: string | null | undefined): Record<string, unknown> | null {
    if (!accessToken) return null;
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;

    try {
        const base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const json = typeof atob === 'function' ? atob(padded) : '';
        if (!json) return null;
        const parsed: unknown = JSON.parse(json);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

interface ClaimsCapableAuth {
    getClaims?: () => Promise<{ data?: { claims?: unknown } | null; error?: AuthErrorLike | null }>;
}

/**
 * Verifies the Access Token. `getClaims()` validates the signature locally when
 * the project uses asymmetric keys (and falls back to a network check
 * otherwise). Older supabase-js builds do not expose it, in which case `null` is
 * returned and the caller relies on `getUser()`.
 */
async function readVerifiedClaims(supabaseClient: SupabaseClient): Promise<Record<string, unknown> | null> {
    const auth = supabaseClient.auth as unknown as ClaimsCapableAuth;
    if (typeof auth.getClaims !== 'function') return null;

    const { data, error } = await auth.getClaims();
    if (error) {
        if (isSessionInvalidError(error)) return null;
        throw classifyAuthError(error);
    }

    const claims = data?.claims;
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null;
}

function snapshotFrom(session: Session, user: User, claims: Record<string, unknown> | null): SessionSnapshot {
    // Claims are authoritative when present; the local token decode is only a
    // fallback so the UI can still show "esta sessão" on older clients.
    const fallback = decodeJwtPayloadForDisplay(session.access_token);
    const source = claims ?? fallback ?? {};

    const sessionId = typeof source.session_id === 'string' ? source.session_id : null;
    const exp = typeof source.exp === 'number' ? source.exp : null;

    return {
        userId: user.id,
        email: (user.email ?? (typeof source.email === 'string' ? source.email : '')) || '',
        sessionId,
        expiresAt: exp ?? session.expires_at ?? null,
        accessToken: session.access_token ?? null,
    };
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Removes the persisted session from client storage.
 *
 * Needed as a separate step because the supported removal path
 * (`signOut({ scope: 'local' })`) fails precisely in the case that traps a user:
 * a stored session the server already rejects, where `signOut` itself throws
 * `AuthSessionMissingError` and leaves the broken entry behind.
 */
export function purgeSessionStorage(): void {
    if (typeof window === 'undefined') return;

    try {
        for (const key of Object.keys(window.localStorage)) {
            if (/^sb-.*-auth-token/.test(key) || key === 'supabase.auth.token') {
                window.localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.warn('[auth] não foi possível limpar o storage da sessão:', error);
    }
}

/** Ends the local session and guarantees the storage is clean either way. */
export async function clearLocalSession(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
        purgeSessionStorage();
        return;
    }

    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
        console.warn('[auth] signOut local falhou; limpando storage diretamente:', error);
    } finally {
        purgeSessionStorage();
    }
}

async function safeReadVerifiedClaims(supabaseClient: SupabaseClient): Promise<Record<string, unknown> | null> {
    try {
        return await readVerifiedClaims(supabaseClient);
    } catch (error) {
        // A network failure while verifying claims must not, by itself, destroy
        // a session that may still be perfectly valid. `getUser()` below is the
        // confirming call; a hard verification failure (invalid token) still
        // throws through.
        if (!(error instanceof AuthError) || !error.retriable) throw error;
        console.warn('[auth] verificação de claims indisponível; confirmando com getUser():', error.message);
        return null;
    }
}

async function confirmUserSession(
    supabaseClient: SupabaseClient,
    session: Session,
    claims: Record<string, unknown> | null
): Promise<SessionSnapshot | null> {
    try {
        // Confirms with the server that the session still exists: `getSession()`
        // cannot tell an active session from one revoked by a sign-out elsewhere.
        const { data: userData, error: userError } = await supabaseClient.auth.getUser();

        if (userError) {
            if (isSessionInvalidError(userError)) {
                await clearLocalSession();
                return null;
            }
            throw classifyAuthError(userError);
        }

        if (!userData.user) {
            await clearLocalSession();
            return null;
        }

        return snapshotFrom(session, userData.user, claims);
    } catch (error) {
        if (error instanceof AuthError && error.code === 'session_expired') {
            await clearLocalSession();
            return null;
        }

        // Degraded mode: the Auth API is unreachable (network/5xx) but the token
        // was already verified by getClaims(). The identity is reported so the
        // UI is not thrown back to the login form by a flaky connection; every
        // data call still goes through RLS with this token, so nothing is opened.
        if (error instanceof AuthError && error.retriable && claims) {
            console.warn('[auth] Auth API inacessível; usando claims verificados do token atual.');
            return snapshotFrom(session, session.user, claims);
        }

        throw error;
    }
}

/**
 * Reads the stored session, verifies the token and confirms it with the Auth
 * server. Returns `null` for "not signed in", and clears the session when the
 * server says it is no longer valid (revoked, deleted user, expired refresh).
 */
export async function verifySession(): Promise<SessionSnapshot | null> {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        if (isSessionInvalidError(error)) {
            await clearLocalSession();
            return null;
        }
        throw classifyAuthError(error);
    }

    if (!data.session) return null;

    const claims = await safeReadVerifiedClaims(supabaseClient);
    return confirmUserSession(supabaseClient, data.session, claims);
}

// ---------------------------------------------------------------------------
// Profile / authorization
// ---------------------------------------------------------------------------

/**
 * Reads the caller's own row from `public.admin_profiles`.
 *
 * RLS allows `user_id = auth.uid()` for any authenticated user, so this works
 * before activation. A denial returns `null` rather than an error: "no profile"
 * is a legitimate state that the UI must explain, not a crash.
 */
export async function loadProfile(userId: string): Promise<AdminProfile | null> {
    const supabaseClient = client();
    const { data, error } = await supabaseClient
        .from('admin_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        throw new AuthError('unknown', `Não foi possível ler seu perfil de acesso: ${error.message}`, {
            original: error.message,
        });
    }

    return (data as AdminProfile | null) ?? null;
}

/**
 * Turns a verified session into an authorized identity.
 * Every branch produces a different, actionable denial.
 */
export async function resolveIdentity(snapshot: SessionSnapshot): Promise<IdentityResolution> {
    const profile = await loadProfile(snapshot.userId);

    if (!profile) {
        return {
            identity: null,
            denial: {
                reason: 'profile_missing',
                title: 'Sua conta não possui perfil de acesso',
                message: `A sessão existe (usuário ${snapshot.userId}), mas public.admin_profiles não tem linha para ela. Contas criadas antes das migrations, ou fora do painel, caem neste estado. Nenhum dado é liberado sem um perfil ativo, porque é essa tabela que as políticas de RLS consultam.`,
            },
        };
    }

    if (!profile.is_active) {
        return {
            identity: null,
            denial: {
                reason: 'profile_inactive',
                title: 'Seu perfil está desativado',
                message: `O perfil ${profile.role} de ${profile.email} existe, porém está com is_active = false. Perfis criados por auto-cadastro nascem desativados de propósito: o acesso precisa de liberação explícita de um administrador.`,
            },
        };
    }

    if (!isKnownRole(profile.role)) {
        return {
            identity: null,
            denial: {
                reason: 'insufficient_role',
                title: 'Perfil de acesso não reconhecido',
                message: `O perfil ${String(profile.role)} não corresponde a nenhum nível conhecido do sistema. Peça a um administrador para revisar o registro em public.admin_profiles.`,
            },
        };
    }

    return {
        identity: {
            userId: snapshot.userId,
            email: profile.email || snapshot.email,
            role: profile.role as AdminRole,
            profile,
            fullName: profile.full_name,
            sessionId: snapshot.sessionId,
            expiresAt: snapshot.expiresAt,
        },
        denial: null,
    };
}

// ---------------------------------------------------------------------------
// Sign in / sign out
// ---------------------------------------------------------------------------

/**
 * Validates credentials, establishes the session and resolves authorization.
 * Never throws for a rejected credential — the outcome is returned so the form
 * can render it inline.
 *
 * On a denial (authenticated but not authorized) the session is kept: the user
 * needs to see *why*, and RLS already denies every read an inactive profile
 * would attempt.
 */
export async function signInWithPassword(credentials: LoginCredentials): Promise<SignInOutcome> {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return { identity: null, error: unconfiguredError().message, denial: null };
    }

    let session: Session | null = null;
    let user: User | null = null;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizeEmail(credentials.email),
            password: credentials.password,
        });

        if (error) {
            return { identity: null, error: classifyAuthError(error).message, denial: null };
        }

        session = data.session;
        user = data.user;
    } catch (error) {
        return { identity: null, error: classifyAuthError(error as AuthErrorLike).message, denial: null };
    }

    // A password sign-in without a session means the project requires e-mail
    // confirmation. Reporting success here would bounce the user back to login
    // with no explanation.
    if (!session || !user) {
        return {
            identity: null,
            error:
                'A autenticação foi aceita, mas nenhuma sessão foi criada. Se a confirmação de e-mail estiver habilitada no projeto, confirme o endereço antes de entrar.',
            denial: null,
        };
    }

    try {
        const claims = await readVerifiedClaims(supabase);
        const snapshot = snapshotFrom(session, user, claims);
        const { identity, denial } = await resolveIdentity(snapshot);
        return { identity, error: null, denial };
    } catch (error) {
        return { identity: null, error: classifyAuthError(error as AuthErrorLike).message, denial: null };
    }
}

/**
 * Ends the session.
 *
 * Supabase revokes refresh tokens server-side for every scope. An Access Token
 * already issued stays valid until its `exp` claim (30 minutes in this project,
 * see jwt_expiry in supabase/config.toml) — the only bound available, because
 * GoTrue signs tokens statelessly.
 *
 * `scope` selects what dies: 'local' (this browser, the normal Sair button),
 * 'global' (every device) or 'others' (every device except this one).
 */
export async function signOut(scope: LogoutScope = 'local'): Promise<{ error: string | null }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: null };

    try {
        const { error } = await supabase.auth.signOut({ scope });

        // 'others' deliberately fires no SIGNED_OUT event and must not touch
        // this browser's session; the caller refreshes its own state.
        if (scope === 'local') purgeSessionStorage();

        if (error) {
            // An already-invalid session is the desired end state, not a failure.
            if (isSessionInvalidError(error)) return { error: null };
            return { error: classifyAuthError(error).message };
        }

        return { error: null };
    } catch (error) {
        if (scope === 'local') purgeSessionStorage();
        if (error instanceof AuthError) return { error: error.message };
        const classified = classifyAuthError(error as AuthErrorLike);
        return { error: classified.code === 'session_expired' ? null : classified.message };
    }
}

// ---------------------------------------------------------------------------
// Session inventory
// ---------------------------------------------------------------------------

/**
 * Lists the caller's own sessions. The RPC reads `auth.sessions` under a
 * SECURITY DEFINER function scoped to `auth.uid()`, because that table is in
 * the `auth` schema and is not reachable through the Data API.
 */
export async function listActiveSessions(): Promise<SessionsListing> {
    const supabase = getSupabaseClient();
    if (!supabase) return { sessions: [], unavailableReason: unconfiguredError().message };

    const { data, error } = await supabase.rpc('my_auth_sessions');

    if (error) {
        const missing = error.code === 'PGRST202' || error.code === '42883';
        return {
            sessions: [],
            unavailableReason: missing
                ? 'A função public.my_auth_sessions() ainda não existe neste banco. Aplique as migrations (supabase db push) para habilitar a listagem de dispositivos.'
                : `Não foi possível listar as sessões: ${error.message}`,
        };
    }

    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

    return {
        sessions: rows.map((row) => ({
            sessionId: typeof row.session_id === 'string' ? row.session_id : '',
            createdAt: (row.created_at as string | null) ?? null,
            refreshedAt: (row.refreshed_at as string | null) ?? null,
            notAfter: (row.not_after as string | null) ?? null,
            ip: (row.ip as string | null) ?? null,
            userAgent: (row.user_agent as string | null) ?? null,
            isCurrent: Boolean(row.is_current),
        })),
    };
}

/** Best-effort heartbeat so `admin_profiles.last_seen_at` reflects reality. */
export async function markSessionSeen(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
        await supabase.rpc('mark_my_session_seen');
    } catch (error) {
        console.warn('[auth] heartbeat de sessão não registrado:', error);
    }
}

/**
 * Writes an auth event to the audit trail through `public.log_my_activity`,
 * which derives the actor from `auth.uid()` — a client cannot claim another
 * actor. Failures are swallowed: an audit write must never block a logout.
 */
export async function logAuthEvent(action: string, summary: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
        await supabase.rpc('log_my_activity', {
            p_action: action,
            p_entity_type: 'auth',
            p_summary: summary,
        });
    } catch (error) {
        console.warn('[auth] evento de autenticação não auditado:', error);
    }
}

// ---------------------------------------------------------------------------
// Auth event subscription
// ---------------------------------------------------------------------------

export type AuthEventName =
    | 'INITIAL_SESSION'
    | 'SIGNED_IN'
    | 'SIGNED_OUT'
    | 'TOKEN_REFRESHED'
    | 'USER_UPDATED'
    | 'PASSWORD_RECOVERY'
    | 'MFA_CHALLENGE_VERIFIED'
    | (string & {});

/**
 * Bridges Supabase auth events to the provider.
 * The listener body is kept free of async work: the docs are explicit that bugs
 * inside `onAuthStateChange` are the usual cause of "randomly logged out"
 * reports, so the provider re-reads the session itself.
 */
export function subscribeToAuthEvents(listener: (event: AuthEventName) => void): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => { };

    const { data } = supabase.auth.onAuthStateChange((event) => {
        listener(event);
    });

    return () => data.subscription.unsubscribe();
}
