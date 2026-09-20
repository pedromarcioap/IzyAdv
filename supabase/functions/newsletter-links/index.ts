/**
 * newsletter-links
 *
 * Server-side link validation for a campaign.
 *
 * This cannot be done in the browser: cross-origin HEAD/GET requests are
 * opaque, so a 404 and a 200 are indistinguishable to client JavaScript.
 * Running the check here also lets the results be persisted, so the editor can
 * show "last checked" state without re-probing on every render.
 *
 * The crawler is deliberately conservative:
 *   - HEAD first, falling back to a ranged GET (many marketing sites reject HEAD)
 *   - short timeout and a hard cap on the number of URLs
 *   - redirects are NOT followed blindly: the final status is what is recorded
 */

import {
    HttpError,
    READ_ROLES,
    errorResponse,
    handleOptions,
    json,
    requireAdmin,
    serviceClient,
    structuredLog,
} from '../_shared/core.ts';
import { NewsletterBlock, extractLinks, sanitizeHtml } from '../_shared/render.ts';

const MAX_URLS = 60;
const TIMEOUT_MS = 8_000;

interface LinkCheckResult {
    url: string;
    status: number | null;
    ok: boolean;
    error: string | null;
}

function collectLinksFromBlocks(blocks: NewsletterBlock[]): string[] {
    const urls = new Set<string>();

    const walk = (items: NewsletterBlock[]) => {
        for (const block of items) {
            switch (block.type) {
                case 'button':
                    if (block.href) urls.add(block.href);
                    break;
                case 'image':
                    if ((block as { href?: string }).href) urls.add((block as { href: string }).href);
                    break;
                case 'video':
                    if ((block as { url?: string }).url) urls.add((block as { url: string }).url);
                    break;
                case 'text':
                case 'html':
                    for (const url of extractLinks(sanitizeHtml((block as { html: string }).html ?? ''))) {
                        urls.add(url);
                    }
                    break;
                case 'columns':
                    for (const column of (block as { columns?: { blocks: NewsletterBlock[] }[] }).columns ?? []) {
                        walk(column.blocks ?? []);
                    }
                    break;
                default:
                    break;
            }
        }
    };

    walk(blocks);
    return [...urls];
}

async function probe(url: string): Promise<LinkCheckResult> {
    const attempt = async (method: 'HEAD' | 'GET'): Promise<Response> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            return await fetch(url, {
                method,
                redirect: 'follow',
                signal: controller.signal,
                headers: {
                    // Some servers reject requests without a browser-like agent.
                    'User-Agent': 'Mozilla/5.0 (compatible; NewsletterLinkChecker/1.0)',
                    Accept: 'text/html,*/*',
                    ...(method === 'GET' ? { Range: 'bytes=0-2048' } : {}),
                },
            });
        } finally {
            clearTimeout(timer);
        }
    };

    try {
        let response = await attempt('HEAD');

        // HEAD is commonly blocked or unimplemented; retry with a ranged GET.
        if (response.status === 405 || response.status === 501 || response.status === 403) {
            response = await attempt('GET');
        }

        return {
            url,
            status: response.status,
            ok: response.status >= 200 && response.status < 400,
            error: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            url,
            status: null,
            ok: false,
            error: message.includes('abort') ? 'tempo esgotado' : message.slice(0, 200),
        };
    }
}

Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'POST') {
            throw new HttpError(405, 'use POST');
        }

        await requireAdmin(req, READ_ROLES);

        const body: { campaign_id?: string; urls?: string[] } = await req.json().catch(() => ({}));
        const supabase = serviceClient();

        let urls: string[] = [];

        if (body.campaign_id) {
            const { data: campaign, error } = await supabase
                .from('newsletter_campaigns')
                .select('id, blocks')
                .eq('id', body.campaign_id)
                .maybeSingle();

            if (error) throw new HttpError(500, 'falha ao carregar a campanha', error.message);
            if (!campaign) throw new HttpError(404, 'campanha não encontrada');

            urls = collectLinksFromBlocks((campaign.blocks as NewsletterBlock[]) ?? []);
        }

        if (body.urls?.length) {
            urls = [...new Set([...urls, ...body.urls.filter((url) => /^https?:\/\//i.test(url))])];
        }

        if (urls.length === 0) {
            return json({ results: [], message: 'nenhum link absoluto encontrado na campanha' });
        }

        if (urls.length > MAX_URLS) {
            urls = urls.slice(0, MAX_URLS);
        }

        // Sequential probing keeps the function within its CPU/network budget and
        // avoids hammering a third-party site with parallel requests.
        const results: LinkCheckResult[] = [];
        for (const url of urls) {
            results.push(await probe(url));
        }

        // Persist the inventory and the latest status for the campaign.
        if (body.campaign_id) {
            const rows = results.map((result) => ({
                campaign_id: body.campaign_id as string,
                url: result.url,
                last_status: result.status,
                last_checked_at: new Date().toISOString(),
            }));

            const { error: upsertError } = await supabase
                .from('newsletter_links')
                .upsert(rows, { onConflict: 'campaign_id,url' });

            if (upsertError) {
                structuredLog('warn', 'falha ao registrar links verificados', { error: upsertError.message });
            }
        }

        const broken = results.filter((result) => !result.ok);

        structuredLog('info', 'verificação de links concluída', {
            campaignId: body.campaign_id ?? null,
            checked: results.length,
            broken: broken.length,
        });

        return json({
            checked: results.length,
            broken: broken.length,
            results,
        });
    } catch (error) {
        return errorResponse(error);
    }
});
