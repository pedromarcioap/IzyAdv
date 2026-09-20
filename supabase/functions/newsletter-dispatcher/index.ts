/**
 * newsletter-dispatcher
 *
 * The sending worker. Invoked two ways:
 *   1. By pg_cron every minute via pg_net, carrying the worker secret.
 *   2. Manually from the admin panel by an editor/admin (JWT authorised).
 *
 * Each invocation:
 *   - promotes due scheduled campaigns into `sending`
 *   - tops up the pgmq queue
 *   - drains a batch, respecting the configured throttle and provider limits
 *   - records delivery events and recomputes campaign counters
 *
 * Delivery guarantees:
 *   - A message is only removed from the queue (`ack`) after the provider has
 *     accepted it, so a crash mid-send results in a retry, never a silent loss.
 *   - Retries use exponential backoff and are capped by `max_attempts`; the
 *     exhausted message is archived to the dead-letter queue.
 *   - Sends are idempotent at the provider level because `provider_message_id`
 *     is persisted and the campaign counters are recomputed from rows rather
 *     than incremented blindly.
 */

import {
    HttpError,
    WRITE_ROLES,
    backoffSeconds,
    errorResponse,
    handleOptions,
    isWorkerCall,
    json,
    requireAdmin,
    serviceClient,
    signToken,
    sleep,
    structuredLog,
} from '../_shared/core.ts';
import {
    DEFAULT_DESIGN,
    NewsletterBlock,
    NewsletterDesign,
    RenderContext,
    renderEmail,
    renderPlainText,
} from '../_shared/render.ts';
import { loadProvider, sendWithProvider, ProviderRow } from '../_shared/providers.ts';

/** Wall-clock safety margin: the platform kills long invocations anyway. */
const TIME_BUDGET_MS = 45_000;
const DEFAULT_BATCH = 20;

interface DispatcherRequest {
    /** Maximum messages to send in this invocation. */
    max_messages?: number;
    /** Restrict the run to a single campaign (used by "disparar agora"). */
    campaign_id?: string;
    /** Recompute counters without sending anything. */
    dry_run?: boolean;
}

interface CampaignRow {
    id: string;
    name: string;
    subject: string;
    preview_text: string | null;
    from_name: string | null;
    from_email: string | null;
    reply_to: string | null;
    blocks: NewsletterBlock[];
    design: NewsletterDesign | null;
    status: string;
    ab_test_enabled: boolean;
    ab_config: Record<string, unknown> | null;
    provider_id?: string | null;
}

interface SubscriberRow {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    job_title: string | null;
    custom_fields: Record<string, unknown> | null;
    unsubscribe_token: string;
    status: string;
}

interface SettingsRow {
    default_from_name: string;
    default_from_email: string;
    default_reply_to: string | null;
    retry_max_attempts: number;
    retry_backoff_seconds: number;
    throttle_per_second: number;
    daily_send_limit: number | null;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    allowed_weekdays: number[] | null;
    tracking_opens: boolean;
    tracking_clicks: boolean;
    unsubscribe_footer: string | null;
    physical_address: string | null;
    privacy_policy_url: string | null;
    utm_campaign_prefix: string;
}

function publicBaseUrl(req: Request): string {
    const configured = Deno.env.get('NEWSLETTER_PUBLIC_URL');
    if (configured) return configured.replace(/\/+$/, '');

    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
}

function timeZone(): string {
    return Deno.env.get('NEWSLETTER_TIMEZONE') ?? 'America/Sao_Paulo';
}

/** Returns the local hour/minute and weekday for the configured timezone. */
function localClock(now: Date): { hour: number; minute: number; weekday: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone(),
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = weekdays.indexOf(get('weekday'));

    return {
        hour: Number(get('hour')) % 24,
        minute: Number(get('minute')),
        weekday: weekday < 0 ? 0 : weekday,
    };
}

function parseTime(value: string | null): number | null {
    if (!value) return null;
    const [hours, minutes] = value.split(':');
    const h = Number(hours);
    const m = Number(minutes ?? '0');
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
}

/**
 * Sending window check. Returns a human-readable reason when sends must wait,
 * or null when it is allowed to proceed.
 */
function outsideSendingWindow(settings: SettingsRow, now: Date): string | null {
    const { hour, minute, weekday } = localClock(now);

    if (settings.allowed_weekdays && settings.allowed_weekdays.length > 0) {
        // Postgres smallint[] uses 0 = Sunday, matching JS getDay().
        if (!settings.allowed_weekdays.includes(weekday)) {
            return `dia da semana ${weekday} fora da janela permitida`;
        }
    }

    const start = parseTime(settings.quiet_hours_start);
    const end = parseTime(settings.quiet_hours_end);
    const current = hour * 60 + minute;

    if (start !== null && end !== null && start !== end) {
        const inQuietHours = start < end
            ? current >= start && current < end
            : current >= start || current < end; // window crosses midnight

        if (inQuietHours) {
            return `horário de silêncio (${settings.quiet_hours_start}-${settings.quiet_hours_end})`;
        }
    }

    return null;
}

function subjectFor(campaign: CampaignRow, variant: 'a' | 'b' | null): string {
    if (!campaign.ab_test_enabled || variant !== 'b') return campaign.subject;

    const alternate = campaign.ab_config?.subject_b;
    return typeof alternate === 'string' && alternate.trim() ? alternate : campaign.subject;
}

Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    const startedAt = Date.now();

    try {
        if (req.method !== 'POST') {
            throw new HttpError(405, 'use POST');
        }

        const isWorker = isWorkerCall(req);
        let triggeredBy = 'cron';

        if (!isWorker) {
            const admin = await requireAdmin(req, WRITE_ROLES);
            triggeredBy = `user:${admin.userId}`;
        }

        const supabase = serviceClient();
        const body: DispatcherRequest = await req.json().catch(() => ({}));
        const maxMessages = Math.min(Math.max(Number(body.max_messages) || DEFAULT_BATCH, 1), 200);

        // -----------------------------------------------------------------------
        // 0. Promotion + queue top-up
        // -----------------------------------------------------------------------
        let promotion: unknown = null;
        const { data: promoted, error: promotionError } = await supabase.rpc('newsletter_queue_due_campaigns', {
            p_batch: 5,
        });

        if (promotionError) {
            structuredLog('warn', 'falha ao promover campanhas agendadas', { error: promotionError.message });
        } else {
            promotion = promoted;
        }

        if (body.dry_run) {
            return json({ dry_run: true, promotion, duration_ms: Date.now() - startedAt });
        }

        // -----------------------------------------------------------------------
        // 1. Load global settings and the provider once per invocation
        // -----------------------------------------------------------------------
        const { data: settingsData, error: settingsError } = await supabase
            .from('newsletter_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (settingsError) {
            throw new HttpError(500, 'falha ao carregar newsletter_settings', settingsError.message);
        }

        const settings = settingsData as SettingsRow;

        const now = new Date();
        const windowBlock = outsideSendingWindow(settings, now);
        if (windowBlock) {
            structuredLog('info', 'disparo suspenso pela janela de envio', { reason: windowBlock });
            return json({ skipped: true, reason: windowBlock, duration_ms: Date.now() - startedAt });
        }

        let provider: ProviderRow;
        try {
            provider = await loadProvider(supabase as never);
        } catch (error) {
            if (error instanceof HttpError && error.status === 409) {
                return json({ skipped: true, reason: error.message }, 200);
            }
            throw error;
        }

        // Daily cap, counted from persisted delivery rows rather than a counter.
        if (provider.daily_limit) {
            const startOfDay = new Date(now);
            startOfDay.setUTCHours(0, 0, 0, 0);

            const { count } = await supabase
                .from('newsletter_campaign_recipients')
                .select('id', { count: 'exact', head: true })
                .eq('provider_id', provider.id)
                .gte('sent_at', startOfDay.toISOString());

            if ((count ?? 0) >= provider.daily_limit) {
                return json({
                    skipped: true,
                    reason: `limite diário do provedor atingido (${count}/${provider.daily_limit})`,
                    duration_ms: Date.now() - startedAt,
                });
            }
        }

        // -----------------------------------------------------------------------
        // 2. Drain the queue
        // -----------------------------------------------------------------------
        const rate = Math.max(
            1,
            Math.min(settings.throttle_per_second || 10, provider.per_second_limit || 10),
        );
        const intervalMs = Math.ceil(1000 / rate);

        const counters = { processed: 0, sent: 0, skipped: 0, failed: 0, retried: 0, dead_lettered: 0 };
        const touchedCampaigns = new Set<string>();

        // Caches keyed by id, valid for the lifetime of the invocation.
        const campaignCache = new Map<string, CampaignRow | null>();
        const subscriberCache = new Map<string, SubscriberRow | null>();

        let lastSendAt = 0;

        while (counters.processed < maxMessages && Date.now() - startedAt < TIME_BUDGET_MS) {
            const { data: messages, error: dequeueError } = await supabase.rpc('newsletter_dequeue', {
                p_quantity: Math.min(maxMessages - counters.processed, 10),
                p_visibility_timeout: 180,
            });

            if (dequeueError) {
                throw new HttpError(500, 'falha ao ler a fila', dequeueError.message);
            }

            if (!messages || messages.length === 0) break;

            for (const message of messages as { msg_id: number; campaign_id: string; recipient_id: string }[]) {
                if (counters.processed >= maxMessages || Date.now() - startedAt > TIME_BUDGET_MS) {
                    // Remaining messages stay invisible until the visibility timeout
                    // expires, so the next tick picks them up automatically.
                    break;
                }

                counters.processed += 1;

                try {
                    // -------------------------------------------------------------
                    // Recipient (with the fields needed to render and to retry)
                    // -------------------------------------------------------------
                    const { data: recipient, error: recipientError } = await supabase
                        .from('newsletter_campaign_recipients')
                        .select('id, campaign_id, subscriber_id, email, variant, status, attempts, max_attempts')
                        .eq('id', message.recipient_id)
                        .maybeSingle();

                    if (recipientError) throw new Error(recipientError.message);

                    if (!recipient) {
                        await supabase.rpc('newsletter_ack', { p_msg_id: message.msg_id });
                        counters.skipped += 1;
                        continue;
                    }

                    const typedRecipient = recipient as {
                        id: string;
                        campaign_id: string;
                        subscriber_id: string | null;
                        email: string;
                        variant: 'a' | 'b' | null;
                        status: string;
                        attempts: number;
                        max_attempts: number;
                    };

                    // Already delivered or terminal: drop the message.
                    if (['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed'].includes(
                        typedRecipient.status,
                    )) {
                        await supabase.rpc('newsletter_ack', { p_msg_id: message.msg_id });
                        counters.skipped += 1;
                        continue;
                    }

                    // -------------------------------------------------------------
                    // Campaign
                    // -------------------------------------------------------------
                    let campaign = campaignCache.get(typedRecipient.campaign_id) ?? null;
                    if (!campaignCache.has(typedRecipient.campaign_id)) {
                        const { data } = await supabase
                            .from('newsletter_campaigns')
                            .select(
                                'id, name, subject, preview_text, from_name, from_email, reply_to, blocks, design, status, ab_test_enabled, ab_config',
                            )
                            .eq('id', typedRecipient.campaign_id)
                            .maybeSingle();

                        campaign = (data as CampaignRow | null) ?? null;
                        campaignCache.set(typedRecipient.campaign_id, campaign);
                    }

                    if (!campaign) {
                        await supabase.rpc('newsletter_ack', { p_msg_id: message.msg_id });
                        counters.skipped += 1;
                        continue;
                    }

                    if (campaign.status === 'paused' || campaign.status === 'canceled' || campaign.status === 'draft') {
                        // Pausing must stop the pipeline immediately.
                        await supabase.rpc('newsletter_nack', {
                            p_msg_id: message.msg_id,
                            p_dead_letter: false,
                        });

                        await supabase
                            .from('newsletter_campaign_recipients')
                            .update({ status: 'queued', next_attempt_at: new Date(Date.now() + 300_000).toISOString() })
                            .eq('id', typedRecipient.id);

                        counters.skipped += 1;
                        continue;
                    }

                    // -------------------------------------------------------------
                    // Subscriber (null subscriber_id => the address was deleted)
                    // -------------------------------------------------------------
                    let subscriber: SubscriberRow | null = null;
                    if (typedRecipient.subscriber_id) {
                        if (subscriberCache.has(typedRecipient.subscriber_id)) {
                            subscriber = subscriberCache.get(typedRecipient.subscriber_id) ?? null;
                        } else {
                            const { data } = await supabase
                                .from('newsletter_subscribers')
                                .select('id, email, name, company, job_title, custom_fields, unsubscribe_token, status')
                                .eq('id', typedRecipient.subscriber_id)
                                .maybeSingle();

                            subscriber = (data as SubscriberRow | null) ?? null;
                            subscriberCache.set(typedRecipient.subscriber_id, subscriber);
                        }
                    }

                    // Re-check consent at send time: an unsubscribe may have landed
                    // between audience build and dispatch.
                    if (!subscriber || subscriber.status !== 'active') {
                        await supabase
                            .from('newsletter_campaign_recipients')
                            .update({ status: 'skipped', last_error: 'inscrito não está mais ativo' })
                            .eq('id', typedRecipient.id);

                        await supabase.rpc('newsletter_ack', { p_msg_id: message.msg_id });
                        counters.skipped += 1;
                        touchedCampaigns.add(typedRecipient.campaign_id);
                        continue;
                    }

                    const { data: suppression } = await supabase
                        .from('newsletter_suppressions')
                        .select('id, is_permanent, expires_at')
                        .eq('email', subscriber.email)
                        .maybeSingle();

                    const suppressed = suppression
                        ? suppression.is_permanent ||
                        !suppression.expires_at ||
                        new Date(suppression.expires_at as string) > new Date()
                        : false;

                    if (suppressed) {
                        await supabase
                            .from('newsletter_campaign_recipients')
                            .update({ status: 'skipped', last_error: 'endereço na lista de supressão' })
                            .eq('id', typedRecipient.id);

                        await supabase.rpc('newsletter_ack', { p_msg_id: message.msg_id });
                        counters.skipped += 1;
                        touchedCampaigns.add(typedRecipient.campaign_id);
                        continue;
                    }

                    // -------------------------------------------------------------
                    // Render
                    // -------------------------------------------------------------
                    const base = publicBaseUrl(req);
                    const signature = await signToken(`${typedRecipient.campaign_id}:${typedRecipient.id}`);

                    const unsubscribeUrl = `${base}/functions/v1/newsletter-track?t=unsubscribe&token=${subscriber.unsubscribe_token}`;

                    const ctx: RenderContext = {
                        subscriber: {
                            email: subscriber.email,
                            name: subscriber.name,
                            company: subscriber.company,
                            jobTitle: subscriber.job_title,
                            customFields: subscriber.custom_fields,
                        },
                        firm: {
                            name: settings.default_from_name,
                            unsubscribeFooter: settings.unsubscribe_footer,
                            physicalAddress: settings.physical_address,
                            privacyPolicyUrl: settings.privacy_policy_url,
                        },
                        urls: {
                            unsubscribe: unsubscribeUrl,
                            preferences: unsubscribeUrl,
                            viewInBrowser: `${base}/functions/v1/newsletter-track?t=view&c=${typedRecipient.campaign_id}&r=${typedRecipient.id}&s=${encodeURIComponent(signature)}`,
                        },
                    };

                    const tracking = {
                        baseUrl: base,
                        campaignId: typedRecipient.campaign_id,
                        recipientId: typedRecipient.id,
                        signature,
                    };

                    const subject = subjectFor(campaign, typedRecipient.variant);
                    const html = renderEmail(
                        {
                            subject,
                            previewText: campaign.preview_text,
                            blocks: campaign.blocks,
                            design: campaign.design ?? DEFAULT_DESIGN,
                            footerHtml: null,
                        },
                        ctx,
                        settings.tracking_opens || settings.tracking_clicks ? tracking : undefined,
                    );

                    const text = renderPlainText(subject, campaign.blocks, ctx);

                    // -------------------------------------------------------------
                    // Throttle, then send
                    // -------------------------------------------------------------
                    const sinceLast = Date.now() - lastSendAt;
                    if (lastSendAt > 0 && sinceLast < intervalMs) {
                        await sleep(intervalMs - sinceLast);
                    }
                    lastSendAt = Date.now();

                    const result = await sendWithProvider(provider, {
                        to: subscriber.email,
                        toName: subscriber.name,
                        fromEmail: campaign.from_email || provider.from_email || settings.default_from_email,
                        fromName: campaign.from_name || provider.from_name || settings.default_from_name,
                        replyTo: campaign.reply_to ?? provider.reply_to ?? settings.default_reply_to ?? null,
                        subject,
                        html,
                        text,
                        listUnsubscribeUrl: unsubscribeUrl,
                        tags: {
                            campaign: campaign.id,
                            recipient: typedRecipient.id,
                        },
                    });

                    // -------------------------------------------------------------
                    // Persist success
                    // -------------------------------------------------------------
                    await supabase
                        .from('newsletter_campaign_recipients')
                        .update({
                            status: 'sent',
                            attempts: typedRecipient.attempts + 1,
                            provider_id: provider.id,
                            provider_message_id: result.providerMessageId,
                            sent_at: new Date().toISOString(),
                            last_error: null,
                        })
                        .eq('id', typedRecipient.id);

                    await supabase.from('newsletter_events').insert({
                        campaign_id: typedRecipient.campaign_id,
                        recipient_id: typedRecipient.id,
                        subscriber_id: subscriber.id,
                        provider_id: provider.id,
                        event_type: 'sent',
                        occurred_at: new Date().toISOString(),
                        metadata: { provider_kind: result.providerKind },
                    });

                    await supabase.rpc('newsletter_ack', { p_msg_id: message.msg_id });

                    counters.sent += 1;
                    touchedCampaigns.add(typedRecipient.campaign_id);
                } catch (error) {
                    // -------------------------------------------------------------
                    // Failure: retry with backoff, or dead-letter
                    // -------------------------------------------------------------
                    const message_ = error instanceof Error ? error.message : String(error);

                    const { data: current } = await supabase
                        .from('newsletter_campaign_recipients')
                        .select('id, campaign_id, subscriber_id, attempts, max_attempts')
                        .eq('id', message.recipient_id)
                        .maybeSingle();

                    const attempts = (current?.attempts ?? 0) + 1;
                    const maxAttempts = current?.max_attempts ?? settings.retry_max_attempts ?? 3;
                    const exhausted = attempts >= maxAttempts;

                    await supabase
                        .from('newsletter_campaign_recipients')
                        .update({
                            attempts,
                            status: exhausted ? 'failed' : 'queued',
                            last_error: message_.slice(0, 1000),
                            provider_id: provider.id,
                            next_attempt_at: exhausted
                                ? null
                                : new Date(
                                    Date.now() +
                                    backoffSeconds(attempts, settings.retry_backoff_seconds || 60) * 1000,
                                ).toISOString(),
                        })
                        .eq('id', message.recipient_id);

                    await supabase.from('newsletter_events').insert({
                        campaign_id: current?.campaign_id ?? message.campaign_id,
                        recipient_id: message.recipient_id,
                        subscriber_id: current?.subscriber_id ?? null,
                        provider_id: provider.id,
                        event_type: exhausted ? 'failed' : 'deferred',
                        reason: message_.slice(0, 500),
                        occurred_at: new Date().toISOString(),
                        metadata: { attempts, max_attempts: maxAttempts },
                    });

                    await supabase.rpc('newsletter_nack', {
                        p_msg_id: message.msg_id,
                        p_dead_letter: exhausted,
                        p_payload: JSON.stringify({
                            msg_id: message.msg_id,
                            campaign_id: current?.campaign_id ?? message.campaign_id,
                            recipient_id: message.recipient_id,
                            error: message_.slice(0, 500),
                            attempts,
                            failed_at: new Date().toISOString(),
                        }),
                    });

                    if (exhausted) counters.dead_lettered += 1;
                    else counters.retried += 1;

                    counters.failed += 1;

                    if (current?.campaign_id) touchedCampaigns.add(current.campaign_id as string);

                    structuredLog('error', 'falha ao enviar mensagem', {
                        recipientId: message.recipient_id,
                        attempts,
                        exhausted,
                        error: message_.slice(0, 300),
                    });
                }
            }
        }

        // -----------------------------------------------------------------------
        // 3. Recompute counters once per touched campaign
        // -----------------------------------------------------------------------
        for (const campaignId of touchedCampaigns) {
            const { error } = await supabase.rpc('newsletter_recalc_campaign_counters', {
                p_campaign_id: campaignId,
            });
            if (error) {
                structuredLog('warn', 'falha ao recalcular contadores', { campaignId, error: error.message });
            }
        }

        structuredLog('info', 'ciclo do dispatcher concluído', { ...counters, triggeredBy });

        return json({
            ...counters,
            campaigns_touched: touchedCampaigns.size,
            provider: { id: provider.id, kind: provider.kind, name: provider.name },
            rate_per_second: rate,
            promotion,
            duration_ms: Date.now() - startedAt,
        });
    } catch (error) {
        return errorResponse(error);
    }
});
