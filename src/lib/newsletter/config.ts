/**
 * Configuration and administration: lists, segments, providers, global
 * settings, the audit trail and admin users.
 *
 * Admin user mutations are routed through the `admin-users` Edge Function
 * because `public.admin_profiles` deliberately has no write policy — a client
 * can never escalate its own role.
 */

import type {
    AdminProfile,
    AdminRole,
    AuditLogEntry,
    NewsletterList,
    NewsletterProvider,
    NewsletterSegment,
    NewsletterSettings,
    SegmentPreviewRow,
} from '../../types/newsletter';
import { getClient, run } from './client';

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function listLists(): Promise<NewsletterList[]> {
    const client = getClient();
    const rows = await run<NewsletterList[]>(
        client
            .from('newsletter_lists')
            .select('*')
            .is('deleted_at', null)
            .order('is_default', { ascending: false })
            .order('name', { ascending: true }) as never,
    );
    return Array.isArray(rows) ? rows : [];
}

export function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

export async function createList(input: {
    name: string;
    description?: string | null;
    doubleOptIn?: boolean;
}): Promise<NewsletterList> {
    const client = getClient();
    return run<NewsletterList>(
        client
            .from('newsletter_lists')
            .insert({
                name: input.name.trim(),
                slug: slugify(input.name),
                description: input.description ?? null,
                double_opt_in: input.doubleOptIn ?? true,
            })
            .select('*')
            .single() as never,
    );
}

export async function updateList(id: string, patch: Partial<NewsletterList>): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_lists').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function deleteList(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client
        .from('newsletter_lists')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export async function listSegments(): Promise<NewsletterSegment[]> {
    const client = getClient();
    const rows = await run<NewsletterSegment[]>(
        client
            .from('newsletter_segments')
            .select('*')
            .is('deleted_at', null)
            .order('name', { ascending: true }) as never,
    );
    return Array.isArray(rows) ? rows : [];
}

export async function createSegment(input: {
    name: string;
    description?: string | null;
    rules: NewsletterSegment['rules'];
}): Promise<NewsletterSegment> {
    const client = getClient();
    return run<NewsletterSegment>(
        client
            .from('newsletter_segments')
            .insert({
                name: input.name.trim(),
                description: input.description ?? null,
                rules: input.rules,
            })
            .select('*')
            .single() as never,
    );
}

export async function updateSegment(id: string, patch: Partial<NewsletterSegment>): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_segments').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function deleteSegment(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client
        .from('newsletter_segments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw new Error(error.message);
}

/** Recounts a segment; the RPC also refreshes `cached_count`. */
export async function countSegment(id: string): Promise<number> {
    const client = getClient();
    const { data, error } = await client.rpc('newsletter_segment_count', { p_segment_id: id });
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
}

export async function previewSegment(id: string, listId?: string | null, limit = 25): Promise<SegmentPreviewRow[]> {
    const client = getClient();
    const { data, error } = await client.rpc('newsletter_segment_preview', {
        p_segment_id: id,
        p_list_id: listId ?? null,
        p_limit: limit,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as SegmentPreviewRow[];
}

/** Field/operator catalogue for the segment builder UI. */
export const SEGMENT_FIELDS: { value: string; label: string; type: 'text' | 'enum' | 'date' | 'number' | 'relation' }[] = [
    { value: 'status', label: 'Status de inscrição', type: 'enum' },
    { value: 'source', label: 'Origem do cadastro', type: 'enum' },
    { value: 'preference_area', label: 'Área de interesse', type: 'text' },
    { value: 'email', label: 'E-mail', type: 'text' },
    { value: 'name', label: 'Nome', type: 'text' },
    { value: 'company', label: 'Empresa', type: 'text' },
    { value: 'job_title', label: 'Cargo', type: 'text' },
    { value: 'created_at', label: 'Data de cadastro', type: 'date' },
    { value: 'confirmed_at', label: 'Data de confirmação', type: 'date' },
    { value: 'last_event_at', label: 'Última interação', type: 'date' },
    { value: 'engagement_score', label: 'Score de engajamento', type: 'number' },
    { value: 'bounce_count', label: 'Quantidade de bounces', type: 'number' },
    { value: 'has_tag', label: 'Possui a tag', type: 'relation' },
    { value: 'in_list', label: 'Pertence à lista', type: 'relation' },
];

export const SEGMENT_OPERATORS = [
    { value: 'eq', label: 'igual a' },
    { value: 'neq', label: 'diferente de' },
    { value: 'contains', label: 'contém' },
    { value: 'in', label: 'está entre' },
    { value: 'gte', label: 'a partir de' },
    { value: 'lte', label: 'até' },
    { value: 'is_null', label: 'está vazio' },
    { value: 'is_not_null', label: 'está preenchido' },
];

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export async function listProviders(): Promise<NewsletterProvider[]> {
    const client = getClient();
    const rows = await run<NewsletterProvider[]>(
        client.from('newsletter_providers').select('*').order('priority', { ascending: true }) as never,
    );
    return Array.isArray(rows) ? rows : [];
}

export async function createProvider(input: Partial<NewsletterProvider> & { name: string; kind: NewsletterProvider['kind'] }): Promise<NewsletterProvider> {
    const client = getClient();
    return run<NewsletterProvider>(
        client
            .from('newsletter_providers')
            .insert({
                name: input.name,
                kind: input.kind,
                is_active: input.is_active ?? true,
                is_default: input.is_default ?? false,
                from_name: input.from_name ?? null,
                from_email: input.from_email ?? null,
                reply_to: input.reply_to ?? null,
                config: input.config ?? {},
                secret_ref: input.secret_ref ?? null,
                webhook_secret_ref: input.webhook_secret_ref ?? null,
                daily_limit: input.daily_limit ?? null,
                hourly_limit: input.hourly_limit ?? null,
                per_second_limit: input.per_second_limit ?? 10,
                priority: input.priority ?? 100,
            })
            .select('*')
            .single() as never,
    );
}

export async function updateProvider(id: string, patch: Partial<NewsletterProvider>): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_providers').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function deleteProvider(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_providers').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

/** Makes one provider the default, clearing the flag on the others first. */
export async function setDefaultProvider(id: string): Promise<void> {
    const client = getClient();

    const { error: clearError } = await client
        .from('newsletter_providers')
        .update({ is_default: false })
        .neq('id', id);
    if (clearError) throw new Error(clearError.message);

    const { error } = await client.from('newsletter_providers').update({ is_default: true }).eq('id', id);
    if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Global settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<NewsletterSettings> {
    const client = getClient();
    return run<NewsletterSettings>(
        client.from('newsletter_settings').select('*').eq('id', 1).single() as never,
    );
}

export async function updateSettings(patch: Partial<NewsletterSettings>): Promise<void> {
    const client = getClient();
    const { data: auth } = await client.auth.getUser();

    const { error } = await client
        .from('newsletter_settings')
        .update({ ...patch, updated_by: auth.user?.id ?? null })
        .eq('id', 1);

    if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditFilters {
    limit?: number;
    entityType?: string | null;
    action?: string | null;
    actorEmail?: string | null;
}

export async function listAuditLogs(filters: AuditFilters = {}): Promise<AuditLogEntry[]> {
    const client = getClient();
    let query = client
        .from('newsletter_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(filters.limit ?? 100, 500));

    if (filters.entityType) query = query.eq('entity_type', filters.entityType);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.actorEmail) query = query.ilike('actor_email', `%${filters.actorEmail}%`);

    const rows = await run<AuditLogEntry[]>(query as never);
    return Array.isArray(rows) ? rows : [];
}

/**
 * Records an explicit action (login, logout, export, ...) against the caller.
 * The RPC derives the actor from the session, so it cannot be spoofed.
 */
export async function logActivity(
    action: string,
    summary?: string,
    entityType = 'auth',
    entityId?: string | null,
    changes: Record<string, unknown> = {},
): Promise<void> {
    const client = getClient();
    const { error } = await client.rpc('log_my_activity', {
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId ?? null,
        p_summary: summary ?? null,
        p_changes: changes,
    });

    // Audit logging must never break the user-facing action it describes.
    if (error) console.warn('falha ao registrar atividade:', error.message);
}

// ---------------------------------------------------------------------------
// Admin users (Edge Function mediated)
// ---------------------------------------------------------------------------

export async function listAdminProfiles(): Promise<AdminProfile[]> {
    const client = getClient();
    const rows = await run<AdminProfile[]>(
        client.from('admin_profiles').select('*').order('created_at', { ascending: true }) as never,
    );
    return Array.isArray(rows) ? rows : [];
}

/** Returns the caller's own authorisation, or null when they have none. */
export async function currentAdminProfile(): Promise<AdminProfile | null> {
    const client = getClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await client
        .from('admin_profiles')
        .select('*')
        .eq('user_id', auth.user.id)
        .maybeSingle();

    if (error) return null;
    return (data as AdminProfile | null) ?? null;
}

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
    const client = getClient();
    const { data, error } = await client.functions.invoke('admin-users', { body });

    if (error) {
        // Edge Function errors surface the JSON body in `error.context`.
        throw new Error(error.message || 'falha ao chamar admin-users');
    }

    const payload = data as { error?: string; details?: unknown } & Record<string, unknown>;
    if (payload?.error) {
        throw new Error(String(payload.error));
    }

    return data as T;
}

export function listAdminUsers(): Promise<{ users: AdminProfile[] }> {
    return invokeAdminUsers<{ users: AdminProfile[] }>({ action: 'list' });
}

export function createAdminUser(input: {
    email: string;
    full_name?: string;
    role: AdminRole;
}): Promise<{ created: boolean; user_id: string | null; recovery_link: string | null }> {
    return invokeAdminUsers({ action: 'create', ...input });
}

export function setAdminUserRole(userId: string, role: AdminRole): Promise<{ updated: boolean }> {
    return invokeAdminUsers({ action: 'set_role', user_id: userId, role });
}

export function setAdminUserActive(userId: string, isActive: boolean): Promise<{ updated: boolean }> {
    return invokeAdminUsers({ action: 'set_active', user_id: userId, is_active: isActive });
}

export function deleteAdminUser(userId: string): Promise<{ deleted: boolean }> {
    return invokeAdminUsers({ action: 'delete', user_id: userId });
}

export function generateRecoveryLink(userId: string): Promise<{ recovery_link: string | null }> {
    return invokeAdminUsers({ action: 'generate_recovery_link', user_id: userId });
}
