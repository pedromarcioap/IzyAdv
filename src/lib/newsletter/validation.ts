/**
 * Client-side block validation and preview rendering.
 *
 * IMPORTANT — the server is authoritative.
 * `supabase/functions/_shared/render.ts` performs the real rendering that gets
 * sent to subscribers, including link rewriting and the tracking pixel. The
 * renderer below exists only so the editor can show an instant preview without
 * a round trip, and it deliberately omits tracking entirely.
 *
 * The two must be kept in step when a block type gains new properties. The
 * duplication is the price of not sharing a module between the Deno runtime and
 * the Vite bundle.
 */

import type {
    Alignment,
    NewsletterBlock,
    NewsletterDesign,
} from '../../types/newsletter';
import { DEFAULT_DESIGN } from '../../types/newsletter';

const FORBIDDEN_TAGS = [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'link',
    'meta',
    'base',
    'applet',
    'frame',
    'frameset',
    'noscript',
    'template',
];

/**
 * HTML escaping.
 *
 * The entity text is assembled from a leading ampersand rather than written as
 * a literal, because a formatter that rewrites `&` back to `&` would turn
 * this into a no-op and make the preview an injection vector.
 */
const HTML_ENTITIES: Record<string, string> = {
    '&': '&' + 'amp;',
    '<': '&' + 'lt;',
    '>': '&' + 'gt;',
    '"': '&' + 'quot;',
    "'": '&' + '#39;',
};

export function escapeHtml(value: string): string {
    return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

/** Mirrors the server-side sanitiser so the preview cannot look safer than reality. */
export function sanitizeHtml(input: string): string {
    if (!input) return '';

    let output = input;

    for (const tag of FORBIDDEN_TAGS) {
        output = output.replace(new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, 'gi'), '');
        output = output.replace(new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>`, 'gi'), '');
    }

    output = output.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
    output = output.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
    output = output.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
    output = output.replace(
        /(href|src)\s*=\s*("|')\s*(javascript|data:text\/html|vbscript):[^"']*\2/gi,
        '$1="#"',
    );

    return output;
}

export interface PreviewContext {
    subscriberName: string;
    subscriberEmail: string;
    firmName: string;
}

const DEFAULT_PREVIEW_CONTEXT: PreviewContext = {
    subscriberName: 'Dr. Cliente Exemplo',
    subscriberEmail: 'cliente@exemplo.com.br',
    firmName: 'Veritas & Lex',
};

/** Replaces {{tokens}} for preview purposes only. */
export function applyPreviewVariables(input: string, context: PreviewContext = DEFAULT_PREVIEW_CONTEXT): string {
    if (!input) return '';

    const map: Record<string, string> = {
        'subscriber.name': context.subscriberName,
        'subscriber.email': context.subscriberEmail,
        name: context.subscriberName,
        email: context.subscriberEmail,
        year: String(new Date().getFullYear()),
        'firm.name': context.firmName,
    };

    return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, token: string) =>
        map[token] !== undefined ? escapeHtml(map[token]) : match,
    );
}

/**
 * Validates a block tree.
 * Returns human-readable issues; an empty array means the campaign is structurally sound.
 */
export function validateBlocks(blocks: NewsletterBlock[]): string[] {
    const issues: string[] = [];

    if (!Array.isArray(blocks)) return ['a estrutura de blocos é inválida'];

    if (blocks.length === 0) {
        issues.push('o informativo está vazio');
        return issues;
    }

    const walk = (items: NewsletterBlock[], path: string) => {
        items.forEach((block, index) => {
            const where = `${path}${index + 1}`;

            switch (block.type) {
                case 'heading':
                    if (!block.text.trim()) issues.push(`bloco ${where} (título): texto vazio`);
                    break;

                case 'text':
                    if (!block.html.replace(/<[^>]+>/g, '').trim()) {
                        issues.push(`bloco ${where} (texto): conteúdo vazio`);
                    }
                    break;

                case 'image':
                    if (!/^https?:\/\/.+/i.test(block.src)) {
                        issues.push(`bloco ${where} (imagem): informe uma URL absoluta (https://)`);
                    } else if (!block.alt?.trim()) {
                        issues.push(`bloco ${where} (imagem): texto alternativo ausente`);
                    }
                    break;

                case 'button':
                    if (!block.label.trim()) issues.push(`bloco ${where} (botão): texto ausente`);
                    if (!/^https?:\/\/.+/i.test(block.href)) {
                        issues.push(`bloco ${where} (botão): destino inválido`);
                    }
                    break;

                case 'video':
                    if (!/^https?:\/\/.+/i.test(block.url)) {
                        issues.push(`bloco ${where} (vídeo): informe uma URL absoluta`);
                    }
                    break;

                case 'columns':
                    if (!block.columns || block.columns.length === 0) {
                        issues.push(`bloco ${where} (colunas): nenhuma coluna definida`);
                        break;
                    }
                    block.columns.forEach((column, columnIndex) => {
                        walk(column.blocks ?? [], `${where}.${columnIndex + 1}.`);
                    });
                    break;

                case 'html':
                    if (!block.html.trim()) issues.push(`bloco ${where} (HTML): conteúdo vazio`);
                    if (/<script/i.test(block.html)) {
                        issues.push(`bloco ${where} (HTML): tags <script> são removidas no envio`);
                    }
                    break;

                default:
                    break;
            }
        });
    };

    walk(blocks, '');

    return issues;
}

/** Every http(s) URL referenced by the campaign, for the link checker UI. */
export function extractBlockLinks(blocks: NewsletterBlock[]): string[] {
    const urls = new Set<string>();

    const walk = (items: NewsletterBlock[]) => {
        for (const block of items) {
            switch (block.type) {
                case 'button':
                    if (block.href) urls.add(block.href);
                    break;
                case 'image':
                    if (block.src) urls.add(block.src);
                    if (block.href) urls.add(block.href);
                    break;
                case 'video':
                    if (block.url) urls.add(block.url);
                    if (block.thumbnail) urls.add(block.thumbnail);
                    break;
                case 'text':
                case 'html': {
                    const html = block.html ?? '';
                    for (const match of html.matchAll(/href\s*=\s*"([^"]+)"/gi)) {
                        urls.add(match[1]);
                    }
                    break;
                }
                case 'columns':
                    for (const column of block.columns ?? []) walk(column.blocks ?? []);
                    break;
                default:
                    break;
            }
        }
    };

    walk(blocks);

    return [...urls].filter((url) => /^https?:\/\//i.test(url));
}

// ---------------------------------------------------------------------------
// Preview rendering
// ---------------------------------------------------------------------------

function alignToText(align: Alignment | undefined): string {
    return align ?? 'left';
}

function renderBlock(
    block: NewsletterBlock,
    design: Required<NewsletterDesign>,
    context: PreviewContext,
): string {
    switch (block.type) {
        case 'heading': {
            const size = block.fontSize ?? (block.level === 1 ? 30 : block.level === 3 ? 19 : 24);
            return `<tr><td style="padding:16px 24px;text-align:${alignToText(block.align)};">
        <h${block.level} style="margin:0;font-family:${design.fontFamily};font-size:${size}px;line-height:1.3;font-weight:700;color:${block.color ?? design.textColor};">${applyPreviewVariables(block.text, context)}</h${block.level}>
      </td></tr>`;
        }

        case 'text':
            return `<tr><td style="padding:16px 24px;text-align:${alignToText(block.align)};">
        <div style="font-family:${design.fontFamily};font-size:${block.fontSize ?? 16}px;line-height:${block.lineHeight ?? 1.65};color:${block.color ?? design.textColor};">${applyPreviewVariables(sanitizeHtml(block.html), context)}</div>
      </td></tr>`;

        case 'image': {
            const width = block.width ?? design.contentWidth;
            const image = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt ?? '')}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${block.borderRadius ?? 6}px;margin:0 auto;" />`;
            const wrapped = block.href
                ? `<a href="${escapeHtml(block.href)}" style="text-decoration:none;">${image}</a>`
                : image;
            return `<tr><td style="padding:${block.paddingY ?? 16}px 24px;text-align:${alignToText(block.align)};">${wrapped}</td></tr>`;
        }

        case 'button':
            return `<tr><td style="padding:16px 24px;text-align:${alignToText(block.align)};">
        <a href="${escapeHtml(block.href)}" style="display:inline-block;padding:14px 28px;background-color:${block.bgColor ?? design.buttonBgColor};color:${block.textColor ?? design.buttonTextColor};font-family:${design.fontFamily};font-size:16px;font-weight:600;text-decoration:none;border-radius:${block.borderRadius ?? 6}px;">${applyPreviewVariables(block.label, context)}</a>
      </td></tr>`;

        case 'divider':
            return `<tr><td style="padding:12px 24px;">
        <div style="width:${block.width ?? 100}%;height:${block.thickness ?? 1}px;background-color:${block.color ?? '#e5e7eb'};margin:0 auto;"></div>
      </td></tr>`;

        case 'spacer':
            return `<tr><td style="height:${block.height ?? 24}px;font-size:0;">&nbsp;</td></tr>`;

        case 'video':
            return `<tr><td style="padding:16px 24px;">
        <a href="${escapeHtml(block.url)}" style="text-decoration:none;">
          ${block.thumbnail
                    ? `<img src="${escapeHtml(block.thumbnail)}" alt="${escapeHtml(block.title ?? 'Vídeo')}" style="display:block;width:100%;height:auto;border-radius:6px;" />`
                    : `<div style="background:#111827;color:#fff;padding:48px 24px;text-align:center;border-radius:6px;font-family:${design.fontFamily};">▶ Assistir ao vídeo</div>`
                }
        </a>
        ${block.title ? `<p style="margin:10px 0 0;font-family:${design.fontFamily};font-size:14px;color:${design.textColor};">${escapeHtml(block.title)}</p>` : ''}
      </td></tr>`;

        case 'html':
            return `<tr><td style="padding:16px 24px;">${applyPreviewVariables(sanitizeHtml(block.html), context)}</td></tr>`;

        case 'columns':
            return `<tr><td style="padding:8px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            ${block.columns
                    .map(
                        (column) =>
                            `<td width="${100 / Math.max(block.columns.length, 1)}%" valign="top" style="padding:0 ${(block.gap ?? 16) / 2}px;">
                     <table role="presentation" width="100%" style="border-collapse:collapse;">${(column.blocks ?? [])
                                .map((child) => renderBlock(child, design, context))
                                .join('')}</table>
                   </td>`,
                    )
                    .join('')}
          </tr>
        </table>
      </td></tr>`;

        default:
            return '';
    }
}

/**
 * Builds the preview document.
 * No tracking pixel and no link rewriting: the numbers shown in a preview must
 * never be confused with real engagement.
 */
export function renderPreviewDocument(
    blocks: NewsletterBlock[],
    design: NewsletterDesign,
    context: PreviewContext = DEFAULT_PREVIEW_CONTEXT,
): string {
    const resolved: Required<NewsletterDesign> = { ...DEFAULT_DESIGN, ...design };

    const body = blocks.map((block) => renderBlock(block, resolved, context)).join('');

    const footer = `<tr><td style="padding:20px 24px 28px;border-top:1px solid #e5e7eb;font-family:${resolved.fontFamily};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
    <p style="margin:0 0 6px;">Você recebe este informativo por ter se cadastrado em nosso site.</p>
    <p style="margin:0;">
      <a href="#preview-nao-rastreado" style="color:#6b7280;">Cancelar inscrição</a> ·
      <a href="#preview-nao-rastreado" style="color:#6b7280;">Política de Privacidade</a>
    </p>
  </td></tr>`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { margin:0; padding:0; background-color:${resolved.backgroundColor}; }
  table { border-collapse:collapse; }
  a { color:${resolved.linkColor}; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${resolved.backgroundColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${resolved.backgroundColor};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="${resolved.contentWidth}" cellpadding="0" cellspacing="0" style="width:${resolved.contentWidth}px;max-width:100%;background-color:${resolved.contentBackgroundColor};border-radius:${resolved.borderRadius}px;overflow:hidden;">
        ${body}
        ${footer}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
