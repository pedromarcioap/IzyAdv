/**
 * Analytics data access.
 *
 * Every heavy aggregation is computed in Postgres by a SECURITY DEFINER RPC
 * that calls `private.assert_privileged_actor()`, so the dashboard cannot be
 * used to read data the caller's role would not otherwise see.
 */

import type {
    CampaignMetricRow,
    CampaignStatus,
    DashboardSummary,
    RecentActivityEntry,
    SendingStatus,
    TimeseriesPoint,
} from '../../types/newsletter';
import { callRpc, getClient } from './client';

export type Granularity = 'day' | 'week' | 'month';

export interface DashboardFilters {
    from: string;
    to: string;
    listId?: string | null;
    segmentId?: string | null;
}

export function dashboardSummary(filters: DashboardFilters): Promise<DashboardSummary> {
    return callRpc<DashboardSummary>('newsletter_dashboard_summary', {
        p_from: filters.from,
        p_to: filters.to,
        p_list_id: filters.listId ?? null,
        p_segment_id: filters.segmentId ?? null,
    });
}

export function metricsTimeseries(
    from: string,
    to: string,
    granularity: Granularity = 'day',
): Promise<TimeseriesPoint[]> {
    return callRpc<TimeseriesPoint[]>('newsletter_metrics_timeseries', {
        p_from: from,
        p_to: to,
        p_granularity: granularity,
    });
}

export function campaignMetrics(options: {
    from?: string | null;
    to?: string | null;
    limit?: number;
    status?: CampaignStatus | null;
} = {}): Promise<CampaignMetricRow[]> {
    return callRpc<CampaignMetricRow[]>('newsletter_campaign_metrics', {
        p_from: options.from ?? null,
        p_to: options.to ?? null,
        p_limit: options.limit ?? 20,
        p_status: options.status ?? null,
    });
}

export function recentActivity(limit = 20): Promise<RecentActivityEntry[]> {
    return callRpc<RecentActivityEntry[]>('newsletter_recent_activity', { p_limit: limit });
}

export function sendingStatus(): Promise<SendingStatus> {
    return callRpc<SendingStatus>('newsletter_sending_status');
}

/** Rebuilds the daily rollup; also runs nightly via pg_cron. */
export function refreshDailyStats(days = 90): Promise<number> {
    return callRpc<number>('newsletter_refresh_daily_stats', { p_days: days });
}

/**
 * A/B comparison helper. Returns per-variant rates derived from the recipient
 * rows, which is the only place the variant assignment is recorded.
 */
export interface VariantMetrics {
    variant: 'a' | 'b';
    recipients: number;
    sent: number;
    open_rate: number;
    click_rate: number;
}

export async function campaignVariantMetrics(campaignId: string): Promise<VariantMetrics[]> {
    const client = getClient();

    const variants: ('a' | 'b')[] = ['a', 'b'];

    const results = await Promise.all(
        variants.map(async (variant) => {
            const { data, count } = await client
                .from('newsletter_campaign_recipients')
                .select('open_count, click_count, status', { count: 'exact' })
                .eq('campaign_id', campaignId)
                .eq('variant', variant);

            const rows = (data ?? []) as { open_count: number; click_count: number; status: string }[];
            const sent = rows.filter((row) =>
                ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed'].includes(
                    row.status,
                ),
            ).length;
            const opens = rows.filter((row) => row.open_count > 0).length;
            const clicks = rows.filter((row) => row.click_count > 0).length;

            return {
                variant,
                recipients: count ?? rows.length,
                sent,
                open_rate: sent > 0 ? Number(((opens / sent) * 100).toFixed(2)) : 0,
                click_rate: sent > 0 ? Number(((clicks / sent) * 100).toFixed(2)) : 0,
            };
        }),
    );

    return results.filter((entry) => entry.recipients > 0);
}
