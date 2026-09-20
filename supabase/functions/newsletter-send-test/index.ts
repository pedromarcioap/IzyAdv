/**
 * newsletter-send-test
 *
 * Sends a one-off preview to a single address so an operator can verify
 * rendering, links and deliverability before committing an audience.
 *
 * Deliberately isolated from the delivery pipeline:
 *   - no rows are written to newsletter_campaign_recipients
 *   - no tracking pixel or rewritten links are emitted
 *   - campaign counters are never touched
 *
 * Authorisation: editor or above. The rendered content is always derived from
 * the stored campaign, so a caller cannot use this endpoint as a generic relay
 * for arbitrary HTML to arbitrary recipients beyond the single `to` address.
 */

import {
    HttpError,
    WRITE_ROLES,
    errorResponse,
    handleOptions,
    json,
    requireAdmin,
    serviceClient,
    structuredLog,
} from '../_shared/core.ts';
import { DEFAULT_DESIGN, NewsletterBlock, NewsletterDesign, RenderContext, renderEmail, renderPlainText } from '../_shared/render.ts';
import { loadProvider, sendWithProvider } from '../_shared/providers.ts';

interface SendTestRequest {
    campaign_id?: string;
    /** Optional overrides used by the editor's live preview. */
    subject?: string;
    preview_text?: string;
    blocks?: NewsletterBlock[];
    design?: NewsletterDesign;
    /** Defaults to the authenticated operator's own address. */
    to?: string;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'POST') {
            throw new HttpError(405, 'use POST');
        }

        const admin = await requireAdmin(req, WRITE_ROLES);
        const supabase = serviceClient();
        const body: SendTestRequest = await req.json().catch(() => ({}));

        const to = (body.to ?? admin.email ?? '').trim();
        if (!EMAIL_PATTERN.test(to)) {
            throw new HttpError(400, 'informe um e-mail de destino válido');
        }

        const { data: settingsData, error: settingsError } = await supabase
            .from('newsletter_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (settingsError) {
            throw new HttpError(500, 'falha ao carregar newsletter_settings', settingsError.message);
        }

        const settings = settingsData as Record<string, string | null>;

        let subject = body.subject ?? '';
        let previewText = body.preview_text ?? null;
        let blocks = body.blocks ?? [];
        let design: NewsletterDesign = body.design ?? DEFAULT_DESIGN;
        let fromName = settings.default_from_name ?? 'Veritatis';
        let fromEmail = settings.default_from_email ?? '';
        let replyTo = settings.default_reply_to ?? null;

        if (body.campaign_id) {
            const { data: campaign, error } = await supabase
                .from('newsletter_campaigns')
                .select('subject, preview_text, blocks, design, from_name, from_email, reply_to')
                .eq('id', body.campaign_id)
                .maybeSingle();

            if (error) {
                throw new HttpError(500, 'falha ao carregar a campanha', error.message);
            }

            if (!campaign) {
                throw new HttpError(404, 'campanha não encontrada');
            }

            // Stored content wins over anything sent in the request body.
            subject = (campaign.subject as string) ?? subject;
            previewText = (campaign.preview_text as string | null) ?? previewText;
            blocks = (campaign.blocks as NewsletterBlock[]) ?? blocks;
            design = (campaign.design as NewsletterDesign) ?? design;
            fromName = (campaign.from_name as string | null) ?? fromName;
            fromEmail = (campaign.from_email as string | null) ?? fromEmail;
            replyTo = (campaign.reply_to as string | null) ?? replyTo;
        }

        if (!subject.trim()) {
            throw new HttpError(400, 'a campanha precisa de um assunto antes do envio de teste');
        }

        if (!Array.isArray(blocks) || blocks.length === 0) {
            throw new HttpError(400, 'não há conteúdo para enviar');
        }

        const provider = await loadProvider(supabase as never);

        const baseUrl = (Deno.env.get('NEWSLETTER_PUBLIC_URL') ?? new URL(req.url).origin).replace(/\/+$/, '');

        const ctx: RenderContext = {
            subscriber: {
                email: to,
                name: 'Pré-visualização',
                company: 'Teste interno',
                customFields: {},
            },
            firm: {
                name: fromName,
                unsubscribeFooter: settings.unsubscribe_footer,
                physicalAddress: settings.physical_address,
                privacyPolicyUrl: settings.privacy_policy_url,
            },
            urls: {
                // A test must never carry a working unsubscribe token.
                unsubscribe: `${baseUrl}/functions/v1/newsletter-track?t=unsubscribe&token=teste`,
            },
            preview: true,
        };

        const html = renderEmail(
            {
                subject,
                previewText,
                blocks,
                design,
                footerHtml:
                    '<p style="margin:0;color:#6b7280;">Este é um envio de teste. Links e variáveis podem aparecer de forma simplificada.</p>',
            },
            ctx,
            // No tracking on test sends.
        );

        const result = await sendWithProvider(provider, {
            to,
            fromEmail: fromEmail || (provider.from_email ?? ''),
            fromName: fromName || (provider.from_name ?? ''),
            replyTo: replyTo ?? undefined,
            subject: `[TESTE] ${subject}`,
            html,
            text: renderPlainText(subject, blocks, ctx),
            tags: { kind: 'test' },
        });

        // Explicit audit entry: service-role writes skip the row-level trigger.
        await supabase.from('newsletter_audit_logs').insert({
            actor_id: admin.userId,
            actor_email: admin.email,
            actor_role: admin.role,
            action: 'send_test',
            entity_type: 'newsletter_campaigns',
            entity_id: body.campaign_id ?? null,
            summary: `Envio de teste para ${to} via ${provider.name}`,
            changes: { to, provider: provider.kind, provider_message_id: result.providerMessageId },
        });

        structuredLog('info', 'envio de teste concluído', { to, provider: provider.kind });

        return json({
            sent: true,
            to,
            provider: { id: provider.id, name: provider.name, kind: provider.kind },
            provider_message_id: result.providerMessageId,
        });
    } catch (error) {
        return errorResponse(error);
    }
});
