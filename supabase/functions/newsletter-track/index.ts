/**
 * newsletter-track
 *
 * Public, unauthenticated endpoints embedded in outgoing email. They are hit by
 * mail clients and by recipients' browsers, so they must be:
 *   - resilient: a failure must never break an email or a visitor's navigation
 *   - cheap: no rendering work beyond what is strictly needed
 *   - safe: open/click signatures are verified before anything is recorded, and
 *     the click endpoint refuses to act as an open redirect for unsigned URLs
 *
 * Routes (query parameter `t`):
 *   open        -> 1x1 transparent GIF, records an `open` event
 *   click       -> 302 to the original URL, records a `click` event
 *   unsubscribe -> cancels the subscription (token based) and renders a page
 *   confirm     -> confirms a double opt-in (token based) and renders a page
 *   view        -> renders the campaign HTML in the browser
 */

import {
    HttpError,
    errorResponse,
    handleOptions,
    json,
    serviceClient,
    structuredLog,
    verifyToken,
} from '../_shared/core.ts';
import {
    DEFAULT_DESIGN,
    NewsletterBlock,
    NewsletterDesign,
    RenderContext,
    renderEmail,
} from '../_shared/render.ts';

/** 1x1 transparent GIF. */
const TRANSPARENT_GIF = Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function gifResponse(): Response {
    return new Response(TRANSPARENT_GIF, {
        status: 200,
        headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            Pragma: 'no-cache',
        },
    });
}

function siteBaseUrl(req: Request): string {
    return (Deno.env.get('NEWSLETTER_PUBLIC_URL') ?? new URL(req.url).origin).replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"');
}

function page(title: string, message: string, status = 200): Response {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           background:#13060a; color:#f5efe6; font-family:Georgia,"Times New Roman",serif; padding:24px; }
    main { max-width:520px; background:#180a0e; border:1px solid #431520; border-radius:12px; padding:36px 32px; }
    h1 { font-size:22px; margin:0 0 12px; color:#d4af37; }
    p { line-height:1.7; margin:0 0 10px; color:#d8cfc4; }
    a { color:#d4af37; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${message}</p></main></body>
</html>`;

    return new Response(html, {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

async function resolveRecipient(recipientId: string) {
    const supabase = serviceClient();

    const { data: recipient } = await supabase
        .from('newsletter_campaign_recipients')
        .select('id, campaign_id, subscriber_id, email')
        .eq('id', recipientId)
        .maybeSingle();

    return { supabase, recipient };
}

/** Records an open/click without letting a failure surface to the client. */
async function recordEvent(
    supabase: ReturnType<typeof serviceClient>,
    eventType: 'open' | 'click',
    campaignId: string,
    recipientId: string,
    subscriberId: string | null,
    url: string | null,
): Promise<void> {
    try {
        const { error } = await supabase.rpc('newsletter_ingest_provider_event', {
            p_provider_id: null,
            // No provider event id: opens and clicks are intentionally not deduplicated.
            p_event_type: eventType,
            p_provider_event_id: null,
            p_provider_message_id: null,
            p_email: null,
            p_url: url,
            p_occurred_at: new Date().toISOString(),
            p_bounce_type: null,
            p_reason: null,
            p_metadata: {
                source: 'tracking_endpoint',
                campaign_id: campaignId,
                recipient_id: recipientId,
                subscriber_id: subscriberId,
            },
        });

        if (error) {
            structuredLog('warn', 'falha ao registrar evento de rastreamento', {
                eventType,
                recipientId,
                error: error.message,
            });
        }
    } catch (error) {
        structuredLog('warn', 'exceção ao registrar evento de rastreamento', {
            eventType,
            recipientId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    const url = new URL(req.url);
    const type = url.searchParams.get('t') ?? 'open';

    try {
        // -----------------------------------------------------------------------
        // Open pixel
        // -----------------------------------------------------------------------
        if (type === 'open') {
            const campaignId = url.searchParams.get('c');
            const recipientId = url.searchParams.get('r');
            const signature = url.searchParams.get('s');

            if (campaignId && recipientId && signature) {
                const payload = await verifyToken(signature);
                if (payload === `${campaignId}:${recipientId}`) {
                    const { supabase, recipient } = await resolveRecipient(recipientId);
                    if (recipient) {
                        await recordEvent(
                            supabase,
                            'open',
                            campaignId,
                            recipientId,
                            (recipient.subscriber_id as string | null) ?? null,
                            null,
                        );
                    }
                }
            }

            // Always return the pixel: a tracking failure must not show a broken image.
            return gifResponse();
        }

        // -----------------------------------------------------------------------
        // Click redirect
        // -----------------------------------------------------------------------
        if (type === 'click') {
            const campaignId = url.searchParams.get('c');
            const recipientId = url.searchParams.get('r');
            const signature = url.searchParams.get('s');
            const target = url.searchParams.get('u');

            const fallback = siteBaseUrl(req);

            if (!campaignId || !recipientId || !signature || !target) {
                return Response.redirect(fallback, 302);
            }

            const payload = await verifyToken(signature);

            // Unsigned or tampered links fall back to the site root. Redirecting to
            // an unverified destination would turn this endpoint into an open redirect.
            if (payload !== `${campaignId}:${recipientId}`) {
                structuredLog('warn', 'assinatura de clique inválida', { campaignId, recipientId });
                return Response.redirect(fallback, 302);
            }

            let destination: URL;
            try {
                destination = new URL(target);
            } catch {
                return Response.redirect(fallback, 302);
            }

            if (!['http:', 'https:'].includes(destination.protocol)) {
                return Response.redirect(fallback, 302);
            }

            const { supabase, recipient } = await resolveRecipient(recipientId);
            if (recipient) {
                await recordEvent(
                    supabase,
                    'click',
                    campaignId,
                    recipientId,
                    (recipient.subscriber_id as string | null) ?? null,
                    destination.toString(),
                );

                // The per-campaign link counter is maintained inside the ingest RPC,
                // which matches the URL against newsletter_links for this campaign.
            }

            return Response.redirect(destination.toString(), 302);
        }

        // -----------------------------------------------------------------------
        // Unsubscribe
        // -----------------------------------------------------------------------
        if (type === 'unsubscribe') {
            const token = url.searchParams.get('token');

            if (!token) {
                return page('Link inválido', 'O link de descadastro está incompleto.', 400);
            }

            const supabase = serviceClient();
            const { data, error } = await supabase.rpc('newsletter_unsubscribe', {
                p_token: token,
                p_reason: 'link_no_email',
            });

            if (error) {
                structuredLog('error', 'falha ao processar descadastro', { error: error.message });
                return page('Não foi possível concluir', 'Tente novamente mais tarde.', 500);
            }

            if (!data) {
                return page(
                    'Inscrição não encontrada',
                    'Este link já foi utilizado ou não é mais válido. Nenhuma ação foi necessária.',
                    200,
                );
            }

            return page(
                'Inscrição cancelada',
                'Você não receberá mais nossos informativos. Se isso foi um engano, basta assinar novamente pelo site. Agradecemos o tempo que esteve conosco.',
                200,
            );
        }

        // -----------------------------------------------------------------------
        // Double opt-in confirmation
        // -----------------------------------------------------------------------
        if (type === 'confirm') {
            const token = url.searchParams.get('token');

            if (!token) {
                return page('Link inválido', 'O link de confirmação está incompleto.', 400);
            }

            const supabase = serviceClient();
            const { data, error } = await supabase.rpc('newsletter_confirm_subscription', { p_token: token });

            if (error) {
                structuredLog('error', 'falha ao confirmar inscrição', { error: error.message });
                return page('Não foi possível concluir', 'Tente novamente mais tarde.', 500);
            }

            if (!data) {
                return page(
                    'Link expirado',
                    'Não localizamos uma inscrição pendente para este link. Realize um novo cadastro no site.',
                    200,
                );
            }

            return page('Inscrição confirmada', 'Seu cadastro está ativo. Obrigado por confirmar!', 200);
        }

        // -----------------------------------------------------------------------
        // View in browser
        // -----------------------------------------------------------------------
        if (type === 'view') {
            const campaignId = url.searchParams.get('c');
            const recipientId = url.searchParams.get('r');
            const signature = url.searchParams.get('s');

            if (!campaignId) {
                return page('Campanha não informada', 'Não foi possível localizar o conteúdo.', 400);
            }

            const isSigned = signature && recipientId && (await verifyToken(signature)) === `${campaignId}:${recipientId}`;

            const supabase = serviceClient();

            const { data: campaign } = await supabase
                .from('newsletter_campaigns')
                .select('id, name, subject, preview_text, blocks, design, status')
                .eq('id', campaignId)
                .maybeSingle();

            if (!campaign) {
                return page('Campanha não encontrada', 'O conteúdo solicitado não está disponível.', 404);
            }

            // Only sent campaigns, or a correctly signed link, may be viewed publicly.
            if (campaign.status !== 'sent' && !isSigned) {
                return page('Conteúdo indisponível', 'Esta campanha ainda não foi enviada.', 403);
            }

            let subscriberEmail = '';
            let subscriberName: string | null = null;

            if (isSigned && recipientId) {
                const { recipient } = await resolveRecipient(recipientId);
                if (recipient) {
                    subscriberEmail = (recipient.email as string) ?? '';
                    const { data: subscriber } = await supabase
                        .from('newsletter_subscribers')
                        .select('name')
                        .eq('id', recipient.subscriber_id as string)
                        .maybeSingle();
                    subscriberName = (subscriber?.name as string | null) ?? null;
                }
            }

            const ctx: RenderContext = {
                subscriber: { email: subscriberEmail, name: subscriberName, customFields: {} },
                firm: { name: 'Veritas & Lex' },
                urls: {
                    unsubscribe: `${siteBaseUrl(req)}/functions/v1/newsletter-track?t=unsubscribe&token=indisponivel`,
                },
            };

            // No tracking pixel in the browser view: it would double-count opens.
            const html = renderEmail(
                {
                    subject: (campaign.subject as string) ?? '',
                    previewText: (campaign.preview_text as string) ?? null,
                    blocks: (campaign.blocks as NewsletterBlock[]) ?? [],
                    design: (campaign.design as NewsletterDesign) ?? DEFAULT_DESIGN,
                    footerHtml: null,
                },
                ctx,
            );

            return new Response(html, {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
            });
        }

        throw new HttpError(400, `tipo de rastreamento desconhecido: ${type}`);
    } catch (error) {
        return errorResponse(error);
    }
});
