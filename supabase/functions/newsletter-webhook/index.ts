/**
 * newsletter-webhook
 *
 * Receives delivery telemetry from the configured transactional provider and
 * folds it into the newsletter tables.
 *
 * Registration: the URL handed to the provider must carry the provider id, e.g.
 *   https://<project>.supabase.co/functions/v1/newsletter-webhook?provider=<uuid>
 * so the correct signing secret can be selected before the payload is trusted.
 *
 * Signature verification:
 *   - resend  : Svix signature (`svix-id` / `svix-timestamp` / `svix-signature`),
 *               including replay-window enforcement.
 *   - others  : shared secret compared in constant time via `x-webhook-secret`
 *               or `?secret=`. Configure the same value as the provider's
 *               `webhook_secret_ref`.
 *
 * Every event is applied through `newsletter_ingest_provider_event`, which is
 * idempotent on (provider_id, provider_event_id): providers retry aggressively,
 * so a duplicate delivery must never double-count an open or a bounce.
 */

import {
    HttpError,
    errorResponse,
    handleOptions,
    json,
    serviceClient,
    structuredLog,
} from '../_shared/core.ts';

type EventType =
    | 'sent'
    | 'delivered'
    | 'open'
    | 'click'
    | 'bounce'
    | 'complaint'
    | 'unsubscribe'
    | 'deferred'
    | 'failed';

interface NormalizedEvent {
    eventType: EventType;
    providerEventId: string | null;
    providerMessageId: string | null;
    email: string | null;
    url: string | null;
    occurredAt: string | null;
    bounceType: 'hard' | 'soft' | 'unknown' | null;
    reason: string | null;
    metadata: Record<string, unknown>;
}

interface ProviderRow {
    id: string;
    name: string;
    kind: 'resend' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses' | 'postmark';
    webhook_secret_ref: string | null;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/**
 * Copies bytes into a freshly allocated ArrayBuffer.
 * `Uint8Array<ArrayBufferLike>` is not assignable to `BufferSource` under the
 * DOM lib typings, so the key material is normalised instead of cast.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Svix-style signature used by Resend. */
async function verifySvix(req: Request, rawBody: string, secret: string): Promise<boolean> {
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) return false;

    // Replay protection: reject anything older than five minutes.
    const timestamp = Number(svixTimestamp);
    if (!Number.isFinite(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
        throw new HttpError(400, 'assinatura do webhook expirada');
    }

    const keyValue = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
    const key = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(base64ToBytes(keyValue)),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
    const expected = bytesToBase64(new Uint8Array(signature));

    // The header carries a space-separated list of "v1,<signature>" entries.
    return svixSignature
        .split(' ')
        .map((part) => part.trim())
        .filter((part) => part.startsWith('v1,'))
        .some((part) => safeEqual(part.slice(3), expected));
}

function resolveSecret(provider: ProviderRow): string {
    if (!provider.webhook_secret_ref) {
        throw new HttpError(
            400,
            `o provedor "${provider.name}" não possui webhook_secret_ref configurado.`,
        );
    }

    const value = Deno.env.get(provider.webhook_secret_ref);
    if (!value) {
        throw new HttpError(400, `segredo de webhook "${provider.webhook_secret_ref}" ausente no ambiente.`);
    }

    return value;
}

async function verifyRequest(
    req: Request,
    url: URL,
    provider: ProviderRow,
    rawBody: string,
): Promise<void> {
    const secret = resolveSecret(provider);

    if (provider.kind === 'resend') {
        if (!(await verifySvix(req, rawBody, secret))) {
            throw new HttpError(401, 'assinatura Svix inválida');
        }
        return;
    }

    const provided = req.headers.get('x-webhook-secret') ?? url.searchParams.get('secret') ?? '';
    if (!safeEqual(provided, secret)) {
        throw new HttpError(401, 'segredo de webhook inválido');
    }
}

// ---------------------------------------------------------------------------
// Payload normalisation
// ---------------------------------------------------------------------------

function mapResendType(type: string, data: Record<string, unknown>): NormalizedEvent | null {
    const base: Omit<NormalizedEvent, 'eventType'> = {
        providerEventId: (data.id as string) ?? null,
        providerMessageId: (data.email_id as string) ?? null,
        email: Array.isArray(data.to) ? ((data.to[0] as string) ?? null) : ((data.to as string) ?? null),
        url: ((data.click as Record<string, unknown>)?.link as string) ?? null,
        occurredAt: (data.created_at as string) ?? null,
        bounceType: null,
        reason: null,
        metadata: { resend_type: type },
    };

    switch (type) {
        case 'email.sent':
            return { ...base, eventType: 'sent' };
        case 'email.delivered':
            return { ...base, eventType: 'delivered' };
        case 'email.opened':
            return { ...base, eventType: 'open' };
        case 'email.clicked':
            return { ...base, eventType: 'click' };
        case 'email.complained':
            return { ...base, eventType: 'complaint' };
        case 'email.delivery_delayed':
            return { ...base, eventType: 'deferred' };
        case 'email.failed':
            return { ...base, eventType: 'failed', reason: (data.reason as string) ?? null };
        case 'email.bounced': {
            const rawType = String((data.bounce as Record<string, unknown>)?.type ?? 'unknown').toLowerCase();
            const bounceType = rawType.startsWith('hard')
                ? 'hard'
                : rawType.startsWith('soft')
                    ? 'soft'
                    : 'unknown';
            return {
                ...base,
                eventType: 'bounce',
                bounceType,
                reason: ((data.bounce as Record<string, unknown>)?.message as string) ?? rawType,
            };
        }
        default:
            return null;
    }
}

function mapSendgridEvent(event: Record<string, unknown>): NormalizedEvent | null {
    const base = {
        providerEventId: (event.sg_event_id as string) ?? null,
        providerMessageId: (event.sg_message_id as string) ?? null,
        email: (event.email as string) ?? null,
        url: (event.url as string) ?? null,
        occurredAt: event.timestamp
            ? new Date(Number(event.timestamp) * 1000).toISOString()
            : null,
        bounceType: null as NormalizedEvent['bounceType'],
        reason: (event.reason as string) ?? null,
        metadata: { sendgrid_event: event.event },
    };

    switch (String(event.event ?? '').toLowerCase()) {
        case 'processed':
            return { ...base, eventType: 'sent' };
        case 'delivered':
            return { ...base, eventType: 'delivered' };
        case 'open':
            return { ...base, eventType: 'open' };
        case 'click':
            return { ...base, eventType: 'click' };
        case 'spamreport':
            return { ...base, eventType: 'complaint' };
        case 'unsubscribe':
        case 'group_unsubscribe':
            return { ...base, eventType: 'unsubscribe' };
        case 'deferred':
            return { ...base, eventType: 'deferred' };
        case 'dropped':
            return { ...base, eventType: 'failed' };
        case 'bounce':
            return {
                ...base,
                eventType: 'bounce',
                bounceType: String(event.type ?? '').toLowerCase() === 'bounced' ? 'hard' : 'soft',
            };
        default:
            return null;
    }
}

function mapPostmarkEvent(payload: Record<string, unknown>): NormalizedEvent | null {
    const base = {
        providerEventId: (payload.ID as string) ?? (payload.MessageID as string) ?? null,
        providerMessageId: (payload.MessageID as string) ?? null,
        email: (payload.Recipient as string) ?? null,
        url: null as string | null,
        occurredAt: (payload.ReceivedAt as string) ?? (payload.BouncedAt as string) ?? null,
        bounceType: null as NormalizedEvent['bounceType'],
        reason: (payload.Description as string) ?? null,
        metadata: { postmark_type: payload.RecordType },
    };

    switch (String(payload.RecordType ?? '')) {
        case 'Delivery':
            return { ...base, eventType: 'delivered' };
        case 'Open':
            return { ...base, eventType: 'open', url: base.url };
        case 'Click':
            return { ...base, eventType: 'click', url: (payload.OriginalLink as string) ?? null };
        case 'SpamComplaint':
            return { ...base, eventType: 'complaint' };
        case 'Bounce':
            return {
                ...base,
                eventType: 'bounce',
                bounceType: String(payload.Type ?? '') === 'HardBounce' ? 'hard' : 'soft',
            };
        default:
            return null;
    }
}

function mapMailgunEvent(payload: Record<string, unknown>): NormalizedEvent | null {
    const eventData = (payload['event-data'] as Record<string, unknown>) ?? payload;

    const base = {
        providerEventId: (eventData.id as string) ?? null,
        providerMessageId:
            ((eventData.message as Record<string, unknown>)?.headers as Record<string, string>)?.[
            'message-id'
            ] ?? null,
        email: (eventData.recipient as string) ?? null,
        url: (eventData.url as string) ?? null,
        occurredAt: eventData.timestamp
            ? new Date(Number(eventData.timestamp) * 1000).toISOString()
            : null,
        bounceType: null as NormalizedEvent['bounceType'],
        reason: (eventData.reason as string) ?? null,
        metadata: { mailgun_event: eventData.event },
    };

    switch (String(eventData.event ?? '').toLowerCase()) {
        case 'accepted':
            return { ...base, eventType: 'sent' };
        case 'delivered':
            return { ...base, eventType: 'delivered' };
        case 'opened':
            return { ...base, eventType: 'open' };
        case 'clicked':
            return { ...base, eventType: 'click' };
        case 'complained':
            return { ...base, eventType: 'complaint' };
        case 'unsubscribed':
            return { ...base, eventType: 'unsubscribe' };
        case 'failed':
            return {
                ...base,
                eventType: 'bounce',
                bounceType:
                    String((eventData.severity as string) ?? '').toLowerCase() === 'permanent' ? 'hard' : 'soft',
            };
        default:
            return null;
    }
}

function normalize(provider: ProviderRow, payload: unknown): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    const push = (event: NormalizedEvent | null) => {
        if (event) events.push(event);
    };

    if (provider.kind === 'sendgrid') {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const item of list) push(mapSendgridEvent(item as Record<string, unknown>));
        return events;
    }

    if (provider.kind === 'postmark') {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const item of list) push(mapPostmarkEvent(item as Record<string, unknown>));
        return events;
    }

    if (provider.kind === 'mailgun') {
        push(mapMailgunEvent(payload as Record<string, unknown>));
        return events;
    }

    if (provider.kind === 'resend') {
        const envelope = payload as { type?: string; data?: Record<string, unknown> };
        if (!envelope.type) return events;

        const data = envelope.data ?? {};
        // Batch payloads carry an array of records.
        if (Array.isArray((data as { emails?: unknown[] }).emails)) {
            for (const item of (data as { emails: Record<string, unknown>[] }).emails) {
                push(mapResendType(envelope.type, item));
            }
            return events;
        }

        push(mapResendType(envelope.type, data));
        return events;
    }

    return events;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'POST') {
            throw new HttpError(405, 'use POST');
        }

        const url = new URL(req.url);
        const providerId = url.searchParams.get('provider');

        if (!providerId) {
            throw new HttpError(400, 'parâmetro "provider" ausente na URL do webhook');
        }

        // Raw body first: the signature covers the exact bytes received.
        const rawBody = await req.text();

        const supabase = serviceClient();

        const { data: providerData, error: providerError } = await supabase
            .from('newsletter_providers')
            .select('id, name, kind, webhook_secret_ref')
            .eq('id', providerId)
            .maybeSingle();

        if (providerError) {
            throw new HttpError(500, 'falha ao carregar o provedor', providerError.message);
        }

        if (!providerData) {
            throw new HttpError(404, 'provedor não encontrado');
        }

        const provider = providerData as ProviderRow;

        await verifyRequest(req, url, provider, rawBody);

        let payload: unknown;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            throw new HttpError(400, 'payload não é JSON válido');
        }

        const events = normalize(provider, payload);

        if (events.length === 0) {
            structuredLog('info', 'webhook sem eventos aplicáveis', { providerId: provider.id });
            return json({ received: true, applied: 0 });
        }

        const results: unknown[] = [];

        for (const event of events) {
            const { data, error } = await supabase.rpc('newsletter_ingest_provider_event', {
                p_provider_id: provider.id,
                p_event_type: event.eventType,
                p_provider_event_id: event.providerEventId,
                p_provider_message_id: event.providerMessageId,
                p_email: event.email,
                p_url: event.url,
                p_occurred_at: event.occurredAt,
                p_bounce_type: event.bounceType,
                p_reason: event.reason,
                p_metadata: event.metadata,
            });

            if (error) {
                // A single malformed event must not make the provider retry the batch
                // forever; it is logged and the rest of the batch still applies.
                structuredLog('error', 'falha ao aplicar evento do provedor', {
                    providerId: provider.id,
                    eventType: event.eventType,
                    error: error.message,
                });
                results.push({ eventType: event.eventType, status: 'error', message: error.message });
                continue;
            }

            results.push(data);
        }

        structuredLog('info', 'webhook processado', {
            providerId: provider.id,
            providerKind: provider.kind,
            applied: results.length,
        });

        return json({ received: true, applied: results.length, results });
    } catch (error) {
        return errorResponse(error);
    }
});
