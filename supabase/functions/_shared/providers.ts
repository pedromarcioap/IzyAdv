/**
 * Transport adapters for outbound email.
 *
 * Provider credentials are NEVER stored in the database. `newsletter_providers`
 * holds only non-secret transport configuration plus a `secret_ref`, which names
 * an Edge Function secret (Deno.env). That keeps the database dump, the Data API
 * and the admin UI free of any credential.
 *
 * Supported kinds:
 *   resend   — HTTPS API (primary)
 *   smtp     — any SMTP relay via nodemailer (fallback / self-hosted)
 *   sendgrid — HTTPS API v3
 *   postmark — HTTPS API
 *   mailgun  — HTTPS API
 *   ses      — not implemented (requires SigV4 signing); fails loudly
 */

import { HttpError, structuredLog } from './core.ts';

export type ProviderKind = 'resend' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses' | 'postmark';

export interface ProviderRow {
    id: string;
    name: string;
    kind: ProviderKind;
    is_active: boolean;
    is_default: boolean;
    from_name: string | null;
    from_email: string | null;
    reply_to: string | null;
    config: Record<string, unknown>;
    secret_ref: string | null;
    webhook_secret_ref: string | null;
    daily_limit: number | null;
    hourly_limit: number | null;
    per_second_limit: number;
    priority: number;
}

export interface OutboundMail {
    to: string;
    toName?: string | null;
    fromEmail: string;
    fromName?: string | null;
    replyTo?: string | null;
    subject: string;
    html: string;
    text?: string;
    listUnsubscribeUrl?: string | null;
    tags?: Record<string, string>;
}

export interface SendResult {
    providerKind: ProviderKind;
    providerMessageId: string | null;
    raw?: unknown;
}

/** Minimal shape needed to select a provider without pulling in the full SDK type. */
interface MinimalClient {
    from(table: string): {
        select(columns: string): {
            eq(column: string, value: unknown): {
                maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
            };
            order(column: string, options?: { ascending?: boolean }): {
                limit(count: number): Promise<{ data: unknown; error: { message: string } | null }>;
            };
            limit(count: number): Promise<{ data: unknown; error: { message: string } | null }>;
        };
    };
}

export async function loadProvider(supabase: MinimalClient, providerId?: string | null): Promise<ProviderRow> {
    if (providerId) {
        const { data, error } = await supabase
            .from('newsletter_providers')
            .select('*')
            .eq('id', providerId)
            .maybeSingle();

        if (error) throw new HttpError(500, 'falha ao carregar o provedor', error.message);
        if (!data) throw new HttpError(404, `provedor ${providerId} não encontrado`);
        return data as ProviderRow;
    }

    const { data, error } = await supabase
        .from('newsletter_providers')
        .select('*')
        .order('priority', { ascending: true })
        .limit(20);

    if (error) throw new HttpError(500, 'falha ao listar provedores', error.message);

    const rows = (data ?? []) as ProviderRow[];
    const usable = rows.filter((row) => row.is_active);

    if (usable.length === 0) {
        throw new HttpError(
            409,
            'nenhum provedor de e-mail ativo. Configure um provedor em Configurações > Envio antes de disparar campanhas.',
        );
    }

    return usable.find((row) => row.is_default) ?? usable[0];
}

function secretFor(provider: ProviderRow): string {
    if (!provider.secret_ref) {
        throw new HttpError(
            400,
            `o provedor "${provider.name}" não possui secret_ref configurado (nome do segredo no Edge Function).`,
        );
    }

    const value = Deno.env.get(provider.secret_ref);
    if (!value) {
        throw new HttpError(
            400,
            `segredo "${provider.secret_ref}" não encontrado nas variáveis do Edge Function.`,
        );
    }

    return value;
}

function configString(provider: ProviderRow, key: string, fallback?: string): string {
    const raw = provider.config?.[key];
    const value = raw === undefined || raw === null ? '' : String(raw);
    if (!value) {
        if (fallback !== undefined) return fallback;
        throw new HttpError(400, `o provedor "${provider.name}" precisa da configuração "${key}".`);
    }
    return value;
}

function configNumber(provider: ProviderRow, key: string, fallback: number): number {
    const raw = provider.config?.[key];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatAddress(email: string, name?: string | null): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return email;
    // Quote the display name so commas/accents cannot break the header.
    return `"${trimmed.replace(/"/g, '')}" <${email}>`;
}

function unsubscribeHeaders(mail: OutboundMail): Record<string, string> {
    if (!mail.listUnsubscribeUrl) return {};
    return {
        'List-Unsubscribe': `<${mail.listUnsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

async function sendViaResend(provider: ProviderRow, mail: OutboundMail): Promise<SendResult> {
    const apiKey = secretFor(provider);
    const baseUrl = configString(provider, 'api_base_url', 'https://api.resend.com');

    const response = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: formatAddress(mail.fromEmail, mail.fromName),
            to: [formatAddress(mail.to, mail.toName)],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            reply_to: mail.replyTo ?? undefined,
            headers: unsubscribeHeaders(mail),
            tags: Object.entries(mail.tags ?? {}).map(([name, value]) => ({ name, value })),
        }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new HttpError(502, `Resend rejeitou o envio (HTTP ${response.status})`, payload);
    }

    return { providerKind: 'resend', providerMessageId: (payload as { id?: string })?.id ?? null, raw: payload };
}

// ---------------------------------------------------------------------------
// SMTP (nodemailer)
// ---------------------------------------------------------------------------

async function sendViaSmtp(provider: ProviderRow, mail: OutboundMail): Promise<SendResult> {
    const host = configString(provider, 'host');
    const port = configNumber(provider, 'port', 587);
    const secure = Boolean(provider.config?.secure) || port === 465;
    const user = typeof provider.config?.username === 'string' ? provider.config.username : undefined;
    const password = secretFor(provider);

    // Loaded lazily so the SMTP stack is not paid for on every Resend send.
    const nodemailer = (await import('npm:nodemailer@6.9.16')).default;

    const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass: password } : undefined,
    });

    const info = await transport.sendMail({
        from: formatAddress(mail.fromEmail, mail.fromName),
        to: formatAddress(mail.to, mail.toName),
        replyTo: mail.replyTo ?? undefined,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: unsubscribeHeaders(mail),
        list: mail.listUnsubscribeUrl
            ? { unsubscribe: { url: mail.listUnsubscribeUrl, comment: 'Cancelar inscrição' } }
            : undefined,
    });

    return { providerKind: 'smtp', providerMessageId: info.messageId ?? null };
}

// ---------------------------------------------------------------------------
// SendGrid
// ---------------------------------------------------------------------------

async function sendViaSendgrid(provider: ProviderRow, mail: OutboundMail): Promise<SendResult> {
    const apiKey = secretFor(provider);

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...unsubscribeHeaders(mail),
        },
        body: JSON.stringify({
            personalizations: [{ to: [{ email: mail.to, name: mail.toName ?? undefined }] }],
            from: { email: mail.fromEmail, name: mail.fromName ?? undefined },
            reply_to: mail.replyTo ? { email: mail.replyTo } : undefined,
            subject: mail.subject,
            content: [
                ...(mail.text ? [{ type: 'text/plain', value: mail.text }] : []),
                { type: 'text/html', value: mail.html },
            ],
            custom_args: mail.tags,
        }),
    });

    if (!response.ok) {
        const payload = await response.text().catch(() => '');
        throw new HttpError(502, `SendGrid rejeitou o envio (HTTP ${response.status})`, payload);
    }

    return {
        providerKind: 'sendgrid',
        providerMessageId: response.headers.get('x-message-id'),
    };
}

// ---------------------------------------------------------------------------
// Postmark
// ---------------------------------------------------------------------------

async function sendViaPostmark(provider: ProviderRow, mail: OutboundMail): Promise<SendResult> {
    const serverToken = secretFor(provider);

    const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': serverToken,
        },
        body: JSON.stringify({
            From: formatAddress(mail.fromEmail, mail.fromName),
            To: mail.to,
            ReplyTo: mail.replyTo ?? undefined,
            Subject: mail.subject,
            HtmlBody: mail.html,
            TextBody: mail.text,
            Headers: Object.entries(unsubscribeHeaders(mail)).map(([Name, Value]) => ({ Name, Value })),
        }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new HttpError(502, `Postmark rejeitou o envio (HTTP ${response.status})`, payload);
    }

    return { providerKind: 'postmark', providerMessageId: (payload as { MessageID?: string })?.MessageID ?? null };
}

// ---------------------------------------------------------------------------
// Mailgun
// ---------------------------------------------------------------------------

async function sendViaMailgun(provider: ProviderRow, mail: OutboundMail): Promise<SendResult> {
    const apiKey = secretFor(provider);
    const domain = configString(provider, 'domain');
    const baseUrl = configString(provider, 'api_base_url', 'https://api.mailgun.net/v3');

    const form = new FormData();
    form.set('from', formatAddress(mail.fromEmail, mail.fromName));
    form.set('to', mail.to);
    form.set('subject', mail.subject);
    form.set('html', mail.html);
    if (mail.text) form.set('text', mail.text);
    if (mail.replyTo) form.set('h:Reply-To', mail.replyTo);
    if (mail.listUnsubscribeUrl) form.set('h:List-Unsubscribe', `<${mail.listUnsubscribeUrl}>`);

    const response = await fetch(`${baseUrl}/${domain}/messages`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
        body: form,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new HttpError(502, `Mailgun rejeitou o envio (HTTP ${response.status})`, payload);
    }

    return { providerKind: 'mailgun', providerMessageId: (payload as { id?: string })?.id ?? null };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const SENDERS: Record<
    Exclude<ProviderKind, 'ses'>,
    (provider: ProviderRow, mail: OutboundMail) => Promise<SendResult>
> = {
    resend: sendViaResend,
    smtp: sendViaSmtp,
    sendgrid: sendViaSendgrid,
    postmark: sendViaPostmark,
    mailgun: sendViaMailgun,
};

export async function sendWithProvider(provider: ProviderRow, mail: OutboundMail): Promise<SendResult> {
    if (!provider.is_active) {
        throw new HttpError(409, `o provedor "${provider.name}" está desativado.`);
    }

    if (provider.kind === 'ses') {
        throw new HttpError(
            501,
            'o adaptador Amazon SES exige assinatura SigV4 e não está implementado. Use resend ou smtp.',
        );
    }

    const sender = SENDERS[provider.kind];
    if (!sender) {
        throw new HttpError(400, `provedor desconhecido: ${provider.kind}`);
    }

    const startedAt = Date.now();
    const result = await sender(provider, mail);
    structuredLog('info', 'email enviado', {
        provider: provider.kind,
        providerId: provider.id,
        durationMs: Date.now() - startedAt,
        providerMessageId: result.providerMessageId,
    });

    return result;
}

/** Used by the settings screen to explain why a provider is not usable yet. */
export function describeProviderReadiness(provider: Partial<ProviderRow>): string[] {
    const missing: string[] = [];

    if (!provider.kind) missing.push('kind');
    if (!provider.secret_ref) missing.push('secret_ref (nome do segredo)');

    switch (provider.kind) {
        case 'smtp':
            if (!provider.config?.host) missing.push('config.host');
            if (!provider.config?.port) missing.push('config.port');
            break;
        case 'mailgun':
            if (!provider.config?.domain) missing.push('config.domain');
            break;
        default:
            break;
    }

    if (provider.secret_ref && !Deno.env.get(provider.secret_ref)) {
        missing.push(`segredo "${provider.secret_ref}" ausente no ambiente`);
    }

    return missing;
}
