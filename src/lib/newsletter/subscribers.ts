/**
 * Subscriber data access.
 *
 * Reads go through the `newsletter_subscriber_overview` view (SECURITY INVOKER,
 * so RLS still applies) which folds in tags and per-subscriber engagement
 * totals, avoiding an N+1 pattern in the table UI.
 */

import type {
    ConsentSource,
    NewsletterSubscriber,
    NewsletterTag,
    SubscriberOverviewRow,
    SubscriberStatus,
    SubscriberTimelineEntry,
} from '../../types/newsletter';
import { MappedSubscriberRow } from './csv';
import { PageRequest, PageResult, callRpc, escapeFilterValue, getClient, run } from './client';

const OVERVIEW_COLUMNS = [
    'id',
    'email',
    'name',
    'status',
    'source',
    'preference_area',
    'created_at',
    'confirmed_at',
    'unsubscribed_at',
    'last_event_at',
    'engagement_score',
    'bounce_count',
    'tags',
    'total_opens',
    'total_clicks',
].join(',');

const SORTABLE_COLUMNS = new Set([
    'created_at',
    'email',
    'name',
    'status',
    'engagement_score',
    'last_event_at',
    'unsubscribed_at',
    'total_opens',
    'total_clicks',
]);

export async function listSubscribers(request: PageRequest): Promise<PageResult<SubscriberOverviewRow>> {
    const client = getClient();
    const page = Math.max(1, request.page);
    const pageSize = Math.min(Math.max(request.pageSize, 5), 200);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client.from('newsletter_subscriber_overview').select(OVERVIEW_COLUMNS, { count: 'exact' });

    const search = request.search?.trim();
    if (search) {
        const term = escapeFilterValue(search);
        query = query.or(`email.ilike.*${term}*,name.ilike.*${term}*`);
    }

    if (request.status) {
        query = query.eq('status', request.status);
    }

    if (request.source) {
        query = query.eq('source', request.source);
    }

    // Tag filtering uses the array column materialised by the view.
    if (request.tagId) {
        const { data: tag } = await client
            .from('newsletter_tags')
            .select('name')
            .eq('id', request.tagId)
            .maybeSingle();

        if (tag?.name) {
            query = query.contains('tags', [tag.name]);
        }
    }

    if (request.listId) {
        const { data: members } = await client
            .from('newsletter_list_members')
            .select('subscriber_id')
            .eq('list_id', request.listId)
            .eq('status', 'active')
            .limit(5000);

        const ids = (members ?? []).map((row) => row.subscriber_id as string);
        if (ids.length === 0) {
            return { rows: [], total: 0, page, pageSize, totalPages: 0 };
        }
        query = query.in('id', ids);
    }

    const sortBy = SORTABLE_COLUMNS.has(request.sortBy ?? '') ? (request.sortBy as string) : 'created_at';
    query = query.order(sortBy, { ascending: request.sortAscending ?? false }).range(from, to);

    const result = await run<SubscriberOverviewRow[]>(query as never);

    const total = (result as unknown as { length: number }).length;
    // `count` is returned alongside data; re-query the count explicitly because
    // the typed helper above only unwraps `data`.
    const { count } = await client
        .from('newsletter_subscriber_overview')
        .select('id', { count: 'exact', head: true });

    return {
        rows: Array.isArray(result) ? result : [],
        total: count ?? total,
        page,
        pageSize,
        totalPages: count ? Math.ceil(count / pageSize) : 1,
    };
}

export async function getSubscriber(id: string): Promise<NewsletterSubscriber> {
    const client = getClient();
    return run<NewsletterSubscriber>(
        client.from('newsletter_subscribers').select('*').eq('id', id).single() as never,
    );
}

export async function subscriberTimeline(id: string, limit = 50): Promise<SubscriberTimelineEntry[]> {
    return callRpc<SubscriberTimelineEntry[]>('newsletter_subscriber_timeline', {
        p_subscriber_id: id,
        p_limit: limit,
    });
}

export interface SubscriberInput {
    email: string;
    name?: string | null;
    company?: string | null;
    job_title?: string | null;
    phone?: string | null;
    preference_area?: string | null;
    status?: SubscriberStatus;
    source?: ConsentSource;
    source_detail?: string | null;
    notes?: string | null;
    custom_fields?: Record<string, unknown>;
}

export async function createSubscriber(input: SubscriberInput): Promise<NewsletterSubscriber> {
    const client = getClient();
    const email = input.email.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error('informe um endereço de e-mail válido');
    }

    return run<NewsletterSubscriber>(
        client
            .from('newsletter_subscribers')
            .insert({
                email,
                name: input.name ?? null,
                company: input.company ?? null,
                job_title: input.job_title ?? null,
                phone: input.phone ?? null,
                preference_area: input.preference_area ?? 'Todas as Matérias',
                status: input.status ?? 'active',
                source: input.source ?? 'admin_import',
                source_detail: input.source_detail ?? 'cadastro manual no painel',
                notes: input.notes ?? null,
                custom_fields: input.custom_fields ?? {},
                consent_given_at: new Date().toISOString(),
                consent_text: 'Cadastro realizado por operador autorizado no painel administrativo.',
            })
            .select('*')
            .single() as never,
    );
}

export async function updateSubscriber(id: string, patch: Partial<NewsletterSubscriber>): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_subscribers').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function setSubscriberStatus(
    ids: string[],
    status: SubscriberStatus,
    reason?: string,
): Promise<void> {
    const client = getClient();
    const patch: Record<string, unknown> = { status };

    if (status === 'unsubscribed') {
        patch.unsubscribed_at = new Date().toISOString();
        patch.unsubscribe_reason = reason ?? 'alteração manual no painel';
    }
    if (status === 'active') {
        patch.unsubscribed_at = null;
        patch.unsubscribe_reason = null;
        patch.confirmed_at = new Date().toISOString();
    }

    const { error } = await client.from('newsletter_subscribers').update(patch).in('id', ids);
    if (error) throw new Error(error.message);
}

export async function deleteSubscribers(ids: string[]): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_subscribers').delete().in('id', ids);
    if (error) throw new Error(error.message);
}

/**
 * Imports mapped CSV rows in chunks.
 * Returns per-row outcomes so the UI can present exactly what was skipped and why.
 */
export async function importSubscribers(
    rows: (MappedSubscriberRow & { __row: number })[],
    options: { source: ConsentSource; listId?: string | null; tagIds?: string[]; chunkSize?: number } = {
        source: 'admin_import',
    },
): Promise<{ inserted: number; failed: { row: number; email: string; reason: string }[] }> {
    const client = getClient();
    const chunkSize = options.chunkSize ?? 200;
    const failed: { row: number; email: string; reason: string }[] = [];
    let inserted = 0;

    const consentedAt = new Date().toISOString();
    const consentText = `Importação em lote no painel administrativo (${options.source}).`;

    for (let index = 0; index < rows.length; index += chunkSize) {
        const chunk = rows.slice(index, index + chunkSize);

        const payload = chunk.map((row) => ({
            email: row.email,
            name: row.name ?? null,
            company: row.company ?? null,
            job_title: row.job_title ?? null,
            phone: row.phone ?? null,
            preference_area: row.preference_area ?? 'Todas as Matérias',
            status: 'active' as SubscriberStatus,
            source: options.source,
            source_detail: 'importação CSV',
            consent_given_at: consentedAt,
            consent_text: consentText,
        }));

        const { data, error } = await client
            .from('newsletter_subscribers')
            .upsert(payload, { onConflict: 'email', ignoreDuplicates: true })
            .select('id, email');

        if (error) {
            // A whole-chunk failure is reported per row rather than silently dropped.
            for (const row of chunk) {
                failed.push({ row: row.__row, email: row.email, reason: error.message });
            }
            continue;
        }

        const accepted = new Set((data ?? []).map((row) => String(row.email).toLowerCase()));
        inserted += accepted.size;

        for (const row of chunk) {
            if (!accepted.has(row.email)) {
                failed.push({
                    row: row.__row,
                    email: row.email,
                    reason: 'já cadastrado (e-mail existente preservado)',
                });
            }
        }

        // Attach list membership and tags for the rows that landed.
        const ids = (data ?? []).map((row) => row.id as string);

        if (ids.length > 0 && options.listId) {
            await client.from('newsletter_list_members').upsert(
                ids.map((id) => ({ list_id: options.listId as string, subscriber_id: id, status: 'active' })),
                { onConflict: 'list_id,subscriber_id' },
            );
        }

        if (ids.length > 0 && options.tagIds && options.tagIds.length > 0) {
            const tagRows = ids.flatMap((subscriberId) =>
                (options.tagIds ?? []).map((tagId) => ({ subscriber_id: subscriberId, tag_id: tagId })),
            );
            await client.from('newsletter_subscriber_tags').upsert(tagRows, {
                onConflict: 'subscriber_id,tag_id',
            });
        }
    }

    return { inserted, failed };
}

export async function listTags(): Promise<NewsletterTag[]> {
    const client = getClient();
    return run<NewsletterTag[]>(
        client.from('newsletter_tags').select('*').order('name', { ascending: true }) as never,
    );
}

export async function createTag(name: string, color = '#D4AF37', description?: string): Promise<NewsletterTag> {
    const client = getClient();
    return run<NewsletterTag>(
        client
            .from('newsletter_tags')
            .insert({ name: name.trim(), color, description: description ?? null })
            .select('*')
            .single() as never,
    );
}

export async function deleteTag(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_tags').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

export async function setSubscriberTags(subscriberId: string, tagIds: string[]): Promise<void> {
    const client = getClient();

    const { error: deleteError } = await client
        .from('newsletter_subscriber_tags')
        .delete()
        .eq('subscriber_id', subscriberId);
    if (deleteError) throw new Error(deleteError.message);

    if (tagIds.length === 0) return;

    const { error } = await client
        .from('newsletter_subscriber_tags')
        .insert(tagIds.map((tagId) => ({ subscriber_id: subscriberId, tag_id: tagId })));
    if (error) throw new Error(error.message);
}

/** LGPD art. 18 II — full data portability export for a single data subject. */
export function exportSubscriberData(id: string): Promise<Record<string, unknown>> {
    return callRpc<Record<string, unknown>>('newsletter_export_subscriber', { p_subscriber_id: id });
}

/** LGPD art. 18 VI — irreversible anonymisation, keeping only aggregate records. */
export function anonymizeSubscriber(id: string): Promise<boolean> {
    return callRpc<boolean>('newsletter_anonymize_subscriber', { p_subscriber_id: id });
}

export interface SubscriberStats {
    total: number;
    active: number;
    pending: number;
    unsubscribed: number;
    bounced: number;
}

/** Lightweight counts for the manager header, one round trip per status. */
export async function subscriberStats(): Promise<SubscriberStats> {
    const client = getClient();

    const countFor = async (status?: SubscriberStatus): Promise<number> => {
        let query = client.from('newsletter_subscribers').select('id', { count: 'exact', head: true });
        if (status) query = query.eq('status', status);
        const { count } = await query;
        return count ?? 0;
    };

    const [total, active, pending, unsubscribed, bounced] = await Promise.all([
        countFor(),
        countFor('active'),
        countFor('pending'),
        countFor('unsubscribed'),
        countFor('bounced'),
    ]);

    return { total, active, pending, unsubscribed, bounced };
}

/** Rows for CSV export, honouring the same filters as the table. */
export async function fetchSubscribersForExport(search?: string): Promise<SubscriberOverviewRow[]> {
    const client = getClient();
    let query = client.from('newsletter_subscriber_overview').select(OVERVIEW_COLUMNS).limit(20000);

    const term = search?.trim();
    if (term) {
        const escaped = escapeFilterValue(term);
        query = query.or(`email.ilike.*${escaped}*,name.ilike.*${escaped}*`);
    }

    const rows = await run<SubscriberOverviewRow[]>(query as never);
    return Array.isArray(rows) ? rows : [];
}
