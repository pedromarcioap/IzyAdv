/**
 * List management data access.
 *
 * Complements `config.ts` (which owns the legacy list CRUD used by the
 * settings panel) with everything the list management screen needs:
 * typed lists, membership, counters, CRM contacts and the sync RPCs.
 *
 * All mutations go through RLS; the RPCs are SECURITY INVOKER so the same
 * policies apply whether the call comes from here or from SQL.
 */

import type {
    CrmContact,
    CrmContactStatus,
    CrmSyncResult,
    ListSyncResult,
    NewsletterList,
    NewsletterListKind,
    NewsletterListMember,
    NewsletterListOptIn,
    NewsletterListStats,
    NewsletterListVisibility,
    SubscriberStatus,
} from '../../types/newsletter';
import { getClient, run, callRpc, translateError } from './client';
import type { PageRequest } from './client';
import { slugify } from './config';

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface ListFilters {
    kind?: NewsletterListKind | null;
    visibility?: NewsletterListVisibility | null;
    search?: string | null;
}

export async function listManagedLists(filters: ListFilters = {}): Promise<NewsletterList[]> {
    const client = getClient();
    let query = client
        .from('newsletter_lists')
        .select('*')
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

    if (filters.kind) query = query.eq('kind', filters.kind);
    if (filters.visibility) query = query.eq('visibility', filters.visibility);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);

    const rows = await run<NewsletterList[]>(query as never);
    return Array.isArray(rows) ? rows : [];
}

export interface CreateManagedListInput {
    name: string;
    description?: string | null;
    kind: NewsletterListKind;
    visibility?: NewsletterListVisibility;
    optInPolicy?: NewsletterListOptIn;
    color?: string;
    doubleOptIn?: boolean;
    importSettings?: Record<string, unknown>;
}

export async function createManagedList(input: CreateManagedListInput): Promise<NewsletterList> {
    const client = getClient();
    return run<NewsletterList>(
        client
            .from('newsletter_lists')
            .insert({
                name: input.name.trim(),
                slug: slugify(input.name),
                description: input.description ?? null,
                kind: input.kind,
                visibility: input.visibility ?? 'shared',
                opt_in_policy: input.optInPolicy ?? 'double',
                color: input.color ?? '#D4AF37',
                double_opt_in: input.doubleOptIn ?? (input.optInPolicy ?? 'double') === 'double',
                import_settings: input.importSettings ?? {},
            })
            .select('*')
            .single() as never,
    );
}

export async function updateManagedList(
    id: string,
    patch: Partial<
        Pick<
            NewsletterList,
            | 'name'
            | 'description'
            | 'kind'
            | 'visibility'
            | 'opt_in_policy'
            | 'color'
            | 'double_opt_in'
            | 'owner_id'
            | 'import_settings'
        >
    >,
): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_lists').update(patch).eq('id', id);
    if (error) throw translateError(error);
}

/** Soft-deletes a list. Members and history are preserved for the audit trail. */
export async function archiveManagedList(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client
        .from('newsletter_lists')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw translateError(error);
}

export async function setDefaultList(id: string): Promise<void> {
    const client = getClient();
    // Clear the current default first: a partial unique index allows only one.
    const { error: clearError } = await client
        .from('newsletter_lists')
        .update({ is_default: false })
        .eq('is_default', true)
        .is('deleted_at', null);
    if (clearError) throw translateError(clearError);

    const { error } = await client.from('newsletter_lists').update({ is_default: true }).eq('id', id);
    if (error) throw translateError(error);
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export async function listStats(listId?: string): Promise<NewsletterListStats[]> {
    const rows = await callRpc<NewsletterListStats[]>('newsletter_list_stats', {
        p_list_id: listId ?? null,
    });
    return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export interface ListMemberFilters extends PageRequest {
    listId: string;
    status?: SubscriberStatus | null;
}

export interface ListMemberPage {
    rows: NewsletterListMember[];
    total: number;
}

export async function listListMembers(filters: ListMemberFilters): Promise<ListMemberPage> {
    const client = getClient();
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let query = client
        .from('newsletter_list_members')
        .select(
            'list_id, subscriber_id, status, joined_at, updated_at, ' +
            'subscriber:newsletter_subscribers!inner(email, name, company, job_title, source, deleted_at)',
            { count: 'exact' },
        )
        .eq('list_id', filters.listId)
        .is('subscriber.deleted_at', null)
        .order('joined_at', { ascending: false })
        .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.search) query = query.ilike('subscriber.email', `%${filters.search}%`);

    const { data, error, count } = await query;
    if (error) throw translateError(error);

    const rawRows = (data ?? []) as unknown as Record<string, unknown>[];
    const rows: NewsletterListMember[] = rawRows.map((row) => {
        const subscriber = (row.subscriber ?? {}) as Record<string, unknown>;
        return {
            list_id: row.list_id as string,
            subscriber_id: row.subscriber_id as string,
            status: row.status as SubscriberStatus,
            joined_at: row.joined_at as string,
            updated_at: row.updated_at as string,
            email: (subscriber.email as string) ?? '',
            name: (subscriber.name as string | null) ?? null,
            company: (subscriber.company as string | null) ?? null,
            job_title: (subscriber.job_title as string | null) ?? null,
            source: (subscriber.source as NewsletterListMember['source']) ?? 'other',
        };
    });

    return { rows, total: count ?? rows.length };
}

/** Adds, unsubscribes or removes subscribers from a list (idempotent). */
export async function syncListMembers(
    listId: string,
    subscriberIds: string[],
    action: 'add' | 'remove' | 'unsubscribe' = 'add',
): Promise<ListSyncResult> {
    return callRpc<ListSyncResult>('newsletter_list_sync_members', {
        p_list_id: listId,
        p_subscriber_ids: subscriberIds,
        p_action: action,
    });
}

/** Subscribers that are not yet in the given list, for the "add members" picker. */
export async function searchSubscribersNotInList(
    listId: string,
    search: string,
    limit = 25,
): Promise<{ id: string; email: string; name: string | null }[]> {
    const client = getClient();

    // PostgREST cannot express NOT EXISTS directly, so fetch the member ids
    // first and exclude them. The list is bounded by `limit` in practice.
    const { data: members, error: memberError } = await client
        .from('newsletter_list_members')
        .select('subscriber_id')
        .eq('list_id', listId);
    if (memberError) throw translateError(memberError);

    const excluded = (members ?? []).map((row: { subscriber_id: string }) => row.subscriber_id);

    let query = client
        .from('newsletter_subscribers')
        .select('id, email, name')
        .is('deleted_at', null)
        .order('email', { ascending: true })
        .limit(limit);

    if (search) query = query.ilike('email', `%${search}%`);
    if (excluded.length > 0) query = query.not('id', 'in', `(${excluded.join(',')})`);

    const { data, error } = await query;
    if (error) throw translateError(error);
    return (data ?? []) as { id: string; email: string; name: string | null }[];
}

// ---------------------------------------------------------------------------
// CRM contacts
// ---------------------------------------------------------------------------

export interface CrmContactFilters extends PageRequest {
    status?: CrmContactStatus | null;
}

export async function listCrmContacts(
    filters: CrmContactFilters,
): Promise<{ rows: CrmContact[]; total: number }> {
    const client = getClient();
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let query = client
        .from('crm_contacts')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.search) query = query.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`);

    const { data, error, count } = await query;
    if (error) throw translateError(error);
    return { rows: (data ?? []) as CrmContact[], total: count ?? 0 };
}

export async function upsertCrmContact(input: {
    email: string;
    fullName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    phone?: string | null;
    status?: CrmContactStatus;
    source?: CrmContact['source'];
    sourceDetail?: string | null;
    tags?: string[];
    customFields?: Record<string, unknown>;
}): Promise<string> {
    return callRpc<string>('crm_upsert_contact', {
        p_email: input.email,
        p_full_name: input.fullName ?? null,
        p_company: input.company ?? null,
        p_job_title: input.jobTitle ?? null,
        p_phone: input.phone ?? null,
        p_status: input.status ?? 'lead',
        p_source: input.source ?? 'other',
        p_source_detail: input.sourceDetail ?? null,
        p_tags: input.tags ?? [],
        p_custom_fields: input.customFields ?? {},
    });
}

export async function updateCrmContact(id: string, patch: Partial<CrmContact>): Promise<void> {
    const client = getClient();
    const { error } = await client.from('crm_contacts').update(patch).eq('id', id);
    if (error) throw translateError(error);
}

/** Links every subscriber without a CRM contact to one (bounded by `limit`). */
export async function syncCrmContacts(limit = 500): Promise<CrmSyncResult> {
    return callRpc<CrmSyncResult>('newsletter_sync_crm_contacts', { p_limit: limit });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Fetches every member of a list for CSV export (bounded to keep memory sane). */
export async function fetchListMembersForExport(
    listId: string,
    limit = 10000,
): Promise<NewsletterListMember[]> {
    const client = getClient();
    const { data, error } = await client
        .from('newsletter_list_members')
        .select(
            'list_id, subscriber_id, status, joined_at, updated_at, ' +
            'subscriber:newsletter_subscribers!inner(email, name, company, job_title, source, deleted_at)',
        )
        .eq('list_id', listId)
        .is('subscriber.deleted_at', null)
        .order('joined_at', { ascending: false })
        .limit(limit);

    if (error) throw translateError(error);

    const rawRows = (data ?? []) as unknown as Record<string, unknown>[];
    return rawRows.map((row) => {
        const subscriber = (row.subscriber ?? {}) as Record<string, unknown>;
        return {
            list_id: row.list_id as string,
            subscriber_id: row.subscriber_id as string,
            status: row.status as SubscriberStatus,
            joined_at: row.joined_at as string,
            updated_at: row.updated_at as string,
            email: (subscriber.email as string) ?? '',
            name: (subscriber.name as string | null) ?? null,
            company: (subscriber.company as string | null) ?? null,
            job_title: (subscriber.job_title as string | null) ?? null,
            source: (subscriber.source as NewsletterListMember['source']) ?? 'other',
        };
    });
}
