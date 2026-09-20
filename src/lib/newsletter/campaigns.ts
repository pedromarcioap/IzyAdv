/**
 * Campaign, template and delivery data access.
 *
 * State changes go through the `newsletter_*` RPCs rather than direct UPDATEs:
 * the RPCs own the transition table and write a version snapshot for every
 * change, which is what makes the history auditable.
 */

import type {
    CampaignStatus,
    CampaignVersion,
    NewsletterBlock,
    NewsletterCampaign,
    NewsletterDesign,
    NewsletterTemplate,
} from '../../types/newsletter';
import { getClient, run } from './client';

export interface CampaignFilters {
    search?: string;
    status?: CampaignStatus | null;
    listId?: string | null;
    limit?: number;
}

export async function listCampaigns(filters: CampaignFilters = {}): Promise<NewsletterCampaign[]> {
    const client = getClient();
    let query = client
        .from('newsletter_campaigns')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(Math.min(filters.limit ?? 100, 500));

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.listId) query = query.eq('list_id', filters.listId);
    if (filters.search?.trim()) {
        const term = filters.search.trim().replace(/[,()\\]/g, '');
        query = query.or(`name.ilike.*${term}*,subject.ilike.*${term}*`);
    }

    const rows = await run<NewsletterCampaign[]>(query as never);
    return Array.isArray(rows) ? rows : [];
}

export async function getCampaign(id: string): Promise<NewsletterCampaign> {
    const client = getClient();
    return run<NewsletterCampaign>(
        client.from('newsletter_campaigns').select('*').eq('id', id).single() as never,
    );
}

export interface CampaignInput {
    name: string;
    subject?: string;
    preview_text?: string | null;
    from_name?: string | null;
    from_email?: string | null;
    reply_to?: string | null;
    list_id?: string | null;
    segment_id?: string | null;
    template_id?: string | null;
    blocks?: NewsletterBlock[];
    design?: NewsletterDesign;
    ab_test_enabled?: boolean;
    ab_config?: Record<string, unknown>;
}

export async function createCampaign(input: CampaignInput): Promise<NewsletterCampaign> {
    const client = getClient();
    const { data: auth } = await client.auth.getUser();

    return run<NewsletterCampaign>(
        client
            .from('newsletter_campaigns')
            .insert({
                name: input.name.trim(),
                subject: input.subject ?? '',
                preview_text: input.preview_text ?? null,
                from_name: input.from_name ?? null,
                from_email: input.from_email ?? null,
                reply_to: input.reply_to ?? null,
                list_id: input.list_id ?? null,
                segment_id: input.segment_id ?? null,
                template_id: input.template_id ?? null,
                blocks: input.blocks ?? [],
                design: input.design ?? {},
                ab_test_enabled: input.ab_test_enabled ?? false,
                ab_config: input.ab_config ?? {},
                created_by: auth.user?.id ?? null,
            })
            .select('*')
            .single() as never,
    );
}

/**
 * Updates a campaign and snapshots the previous state.
 * Only draft/scheduled/paused campaigns accept content edits — the database
 * constraint and the RLS policies both assume an immutable sent payload.
 */
export async function updateCampaign(
    id: string,
    patch: Partial<CampaignInput>,
    changeNote?: string,
): Promise<NewsletterCampaign> {
    const client = getClient();

    const current = await getCampaign(id);

    if (['sent', 'sending', 'queued', 'canceled'].includes(current.status)) {
        throw new Error(
            `Campanhas com status "${current.status}" não podem ser editadas. Duplique a campanha para criar uma nova versão.`,
        );
    }

    const nextVersion = (current.version ?? 1) + 1;

    const updated = await run<NewsletterCampaign>(
        client
            .from('newsletter_campaigns')
            .update({ ...patch, version: nextVersion })
            .eq('id', id)
            .select('*')
            .single() as never,
    );

    const { data: auth } = await client.auth.getUser();

    await client.from('newsletter_campaign_versions').insert({
        campaign_id: id,
        version: current.version ?? 1,
        snapshot: current as unknown as Record<string, unknown>,
        change_note: changeNote ?? 'edição no painel',
        created_by: auth.user?.id ?? null,
    });

    return updated;
}

export async function listCampaignVersions(campaignId: string): Promise<CampaignVersion[]> {
    const client = getClient();
    const rows = await run<CampaignVersion[]>(
        client
            .from('newsletter_campaign_versions')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('version', { ascending: false }) as never,
    );
    return Array.isArray(rows) ? rows : [];
}

export async function archiveCampaign(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client
        .from('newsletter_campaigns')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw new Error(error.message);
}

/** Duplicates a campaign as a fresh draft, preserving content but not history. */
export async function duplicateCampaign(id: string): Promise<NewsletterCampaign> {
    const source = await getCampaign(id);
    const client = getClient();
    const { data: auth } = await client.auth.getUser();

    return run<NewsletterCampaign>(
        client
            .from('newsletter_campaigns')
            .insert({
                name: `${source.name} (cópia)`,
                subject: source.subject,
                preview_text: source.preview_text,
                from_name: source.from_name,
                from_email: source.from_email,
                reply_to: source.reply_to,
                list_id: source.list_id,
                segment_id: source.segment_id,
                template_id: source.template_id,
                blocks: source.blocks,
                design: source.design,
                ab_test_enabled: source.ab_test_enabled,
                ab_config: source.ab_config,
                duplicated_from: source.id,
                status: 'draft',
                created_by: auth.user?.id ?? null,
            })
            .select('*')
            .single() as never,
    );
}

// ---------------------------------------------------------------------------
// Lifecycle actions (delegated to the state-machine RPC)
// ---------------------------------------------------------------------------

export async function scheduleCampaign(id: string, scheduledAt: string): Promise<NewsletterCampaign> {
    const client = getClient();
    await ensureAudience(id);

    return run<NewsletterCampaign>(
        client.rpc('newsletter_set_campaign_status', {
            p_campaign_id: id,
            p_status: 'scheduled',
            p_scheduled_at: scheduledAt,
            p_reason: 'agendamento pelo painel',
        }) as never,
    );
}

export async function unscheduleCampaign(id: string): Promise<NewsletterCampaign> {
    const client = getClient();
    return run<NewsletterCampaign>(
        client.rpc('newsletter_set_campaign_status', {
            p_campaign_id: id,
            p_status: 'draft',
            p_scheduled_at: null,
            p_reason: 'agendamento cancelado',
        }) as never,
    );
}

/** Materialises the audience so the operator can see the real recipient count. */
export async function ensureAudience(id: string): Promise<number> {
    const client = getClient();
    const { data, error } = await client.rpc('newsletter_build_audience', { p_campaign_id: id });
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
}

export async function sendCampaignNow(id: string): Promise<{ recipients_built: number; messages_queued: number }> {
    const client = getClient();
    const { data, error } = await client.rpc('newsletter_send_now', { p_campaign_id: id });
    if (error) throw new Error(error.message);
    return data as { recipients_built: number; messages_queued: number };
}

export async function pauseCampaign(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.rpc('newsletter_pause_campaign', { p_campaign_id: id });
    if (error) throw new Error(error.message);
}

export async function resumeCampaign(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.rpc('newsletter_resume_campaign', { p_campaign_id: id });
    if (error) throw new Error(error.message);
}

export async function cancelCampaign(id: string, reason?: string): Promise<void> {
    const client = getClient();
    const { error } = await client.rpc('newsletter_cancel_campaign', {
        p_campaign_id: id,
        p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
}

/**
 * Nudges the sending worker immediately.
 * The cron job also runs every minute, so this is an optimisation for the
 * "disparar agora" button, not a requirement for delivery.
 */
export async function pokeDispatcher(campaignId?: string): Promise<Record<string, unknown>> {
    const client = getClient();
    const { data, error } = await client.functions.invoke('newsletter-dispatcher', {
        body: { campaign_id: campaignId ?? null, max_messages: 20 },
    });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? {};
}

// ---------------------------------------------------------------------------
// Test sends
// ---------------------------------------------------------------------------

export async function sendTestEmail(options: {
    campaignId?: string | null;
    to?: string;
    subject?: string;
    previewText?: string | null;
    blocks?: NewsletterBlock[];
    design?: NewsletterDesign;
}): Promise<Record<string, unknown>> {
    const client = getClient();

    const { data, error } = await client.functions.invoke('newsletter-send-test', {
        body: {
            campaign_id: options.campaignId ?? undefined,
            to: options.to,
            subject: options.subject,
            preview_text: options.previewText,
            blocks: options.blocks,
            design: options.design,
        },
    });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? {};
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(includeArchived = false): Promise<NewsletterTemplate[]> {
    const client = getClient();
    let query = client
        .from('newsletter_templates')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

    if (!includeArchived) query = query.eq('is_archived', false);

    const rows = await run<NewsletterTemplate[]>(query as never);
    return Array.isArray(rows) ? rows : [];
}

export async function createTemplate(input: {
    name: string;
    description?: string | null;
    category?: string;
    subject?: string;
    preview_text?: string | null;
    blocks: NewsletterBlock[];
    design?: NewsletterDesign;
}): Promise<NewsletterTemplate> {
    const client = getClient();
    const { data: auth } = await client.auth.getUser();

    return run<NewsletterTemplate>(
        client
            .from('newsletter_templates')
            .insert({
                name: input.name.trim(),
                description: input.description ?? null,
                category: input.category ?? 'geral',
                subject: input.subject ?? '',
                preview_text: input.preview_text ?? null,
                blocks: input.blocks,
                design: input.design ?? {},
                created_by: auth.user?.id ?? null,
            })
            .select('*')
            .single() as never,
    );
}

export async function updateTemplate(id: string, patch: Partial<NewsletterTemplate>): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_templates').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function deleteTemplate(id: string): Promise<void> {
    const client = getClient();
    const { error } = await client.from('newsletter_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Link inventory and validation
// ---------------------------------------------------------------------------

export interface LinkCheckResult {
    url: string;
    status: number | null;
    ok: boolean;
    error: string | null;
}

/**
 * Validates every link in a campaign server-side.
 * Doing this in the browser is not viable: cross-origin HEAD requests are
 * opaque, so a broken link would look identical to a working one.
 */
export async function checkCampaignLinks(campaignId: string): Promise<LinkCheckResult[]> {
    const client = getClient();
    const { data, error } = await client.functions.invoke('newsletter-links', {
        body: { campaign_id: campaignId },
    });

    if (error) throw new Error(error.message);
    return ((data as { results?: LinkCheckResult[] })?.results ?? []) as LinkCheckResult[];
}
