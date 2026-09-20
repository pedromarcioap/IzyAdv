/**
 * Server-side newsletter renderer.
 *
 * The visual editor stores a block tree; this module turns it into email-safe
 * HTML. Two rules are enforced here and mirrored in the client:
 *   1. Every interpolated value is HTML-escaped, so a subscriber whose name is
 *      `"><script>` cannot inject markup into the email.
 *   2. `html` blocks are sanitised server-side. Raw HTML is a legitimate
 *      requirement, but it must not become an XSS/stored-injection vector.
 */

import { escapeHtml } from './core.ts';

export type Alignment = 'left' | 'center' | 'right';

export interface BlockBase {
    id: string;
    type: string;
}

export interface HeadingBlock extends BlockBase {
    type: 'heading';
    text: string;
    level?: 1 | 2 | 3;
    align?: Alignment;
    color?: string;
    fontSize?: number;
}

export interface TextBlock extends BlockBase {
    type: 'text';
    html: string;
    align?: Alignment;
    color?: string;
    fontSize?: number;
    lineHeight?: number;
}

export interface ImageBlock extends BlockBase {
    type: 'image';
    src: string;
    alt?: string;
    href?: string;
    width?: number;
    align?: Alignment;
    borderRadius?: number;
    paddingY?: number;
}

export interface ButtonBlock extends BlockBase {
    type: 'button';
    label: string;
    href: string;
    align?: Alignment;
    bgColor?: string;
    textColor?: string;
    borderRadius?: number;
    fullWidth?: boolean;
}

export interface DividerBlock extends BlockBase {
    type: 'divider';
    color?: string;
    thickness?: number;
    width?: number;
}

export interface SpacerBlock extends BlockBase {
    type: 'spacer';
    height?: number;
}

export interface ColumnsBlock extends BlockBase {
    type: 'columns';
    gap?: number;
    columns: { width?: number; blocks: NewsletterBlock[] }[];
    stackOnMobile?: boolean;
}

export interface VideoBlock extends BlockBase {
    type: 'video';
    url: string;
    thumbnail?: string;
    title?: string;
}

export interface HtmlBlock extends BlockBase {
    type: 'html';
    html: string;
}

export type NewsletterBlock =
    | HeadingBlock
    | TextBlock
    | ImageBlock
    | ButtonBlock
    | DividerBlock
    | SpacerBlock
    | ColumnsBlock
    | VideoBlock
    | HtmlBlock;

export interface NewsletterDesign {
    backgroundColor?: string;
    contentBackgroundColor?: string;
    textColor?: string;
    linkColor?: string;
    fontFamily?: string;
    contentWidth?: number;
    borderRadius?: number;
    buttonBgColor?: string;
    buttonTextColor?: string;
}

export const DEFAULT_DESIGN: Required<NewsletterDesign> = {
    backgroundColor: '#f4f4f5',
    contentBackgroundColor: '#ffffff',
    textColor: '#1f2937',
    linkColor: '#8a6a1f',
    fontFamily: 'Georgia, "Times New Roman", serif',
    contentWidth: 640,
    borderRadius: 8,
    buttonBgColor: '#581825',
    buttonTextColor: '#ffffff',
};

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

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
 * Removes executable markup from raw HTML blocks.
 * Attribute-level script handlers and `javascript:` URLs are stripped too.
 */
export function sanitizeHtml(input: string): string {
    if (!input) return '';

    let output = input;

    for (const tag of FORBIDDEN_TAGS) {
        output = output.replace(new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, 'gi'), '');
        output = output.replace(new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>`, 'gi'), '');
    }

    // Inline event handlers: onclick="...", onerror='...', onload=...
    output = output.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
    output = output.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
    output = output.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

    // Protocol-based payloads.
    output = output.replace(/(href|src)\s*=\s*("|')\s*(javascript|data:text\/html|vbscript):[^"']*\2/gi, '$1="#"');

    return output;
}

// ---------------------------------------------------------------------------
// Personalisation
// ---------------------------------------------------------------------------

export interface RenderContext {
    subscriber: {
        email: string;
        name?: string | null;
        company?: string | null;
        jobTitle?: string | null;
        customFields?: Record<string, unknown> | null;
    };
    firm: {
        name: string;
        unsubscribeFooter?: string | null;
        physicalAddress?: string | null;
        privacyPolicyUrl?: string | null;
    };
    urls: {
        unsubscribe: string;
        preferences?: string;
        viewInBrowser?: string;
    };
    /** Campaign preview mode: never emit tracking pixels or real unsubscribe links. */
    preview?: boolean;
}

function lookupVariable(name: string, ctx: RenderContext): string | null {
    const key = name.trim().toLowerCase();

    switch (key) {
        case 'subscriber.email':
        case 'email':
            return ctx.subscriber.email;
        case 'subscriber.name':
        case 'name':
            return ctx.subscriber.name ?? '';
        case 'subscriber.company':
        case 'company':
            return ctx.subscriber.company ?? '';
        case 'subscriber.job_title':
            return ctx.subscriber.jobTitle ?? '';
        case 'unsubscribe_url':
            return ctx.urls.unsubscribe;
        case 'preferences_url':
            return ctx.urls.preferences ?? ctx.urls.unsubscribe;
        case 'view_in_browser_url':
            return ctx.urls.viewInBrowser ?? '#';
        case 'year':
            return String(new Date().getFullYear());
        case 'firm.name':
            return ctx.firm.name;
        default:
            break;
    }

    if (key.startsWith('custom.')) {
        const customKey = name.trim().slice('custom.'.length);
        const value = ctx.subscriber.customFields?.[customKey];
        return value === undefined || value === null ? '' : String(value);
    }

    return null;
}

/**
 * Replaces {{tokens}} with escaped values. Unknown tokens are left untouched so
 * a typo is visible to the operator instead of silently disappearing.
 */
export function applyVariables(input: string, ctx: RenderContext): string {
    if (!input) return '';
    return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, token: string) => {
        const value = lookupVariable(token, ctx);
        return value === null ? match : escapeHtml(value);
    });
}

/** Tokens the editor offers in its variable picker. */
export const AVAILABLE_VARIABLES = [
    '{{subscriber.name}}',
    '{{subscriber.email}}',
    '{{subscriber.company}}',
    '{{unsubscribe_url}}',
    '{{view_in_browser_url}}',
    '{{year}}',
    '{{firm.name}}',
] as const;

// ---------------------------------------------------------------------------
// Link rewriting and tracking
// ---------------------------------------------------------------------------

const HREF_PATTERN = /href\s*=\s*"([^"]+)"/gi;

export function extractLinks(html: string): string[] {
    const found = new Set<string>();
    for (const match of html.matchAll(HREF_PATTERN)) {
        const url = match[1];
        if (/^https?:\/\//i.test(url)) found.add(url);
    }
    return [...found];
}

function encodeParam(value: string): string {
    return encodeURIComponent(value);
}

export interface TrackingConfig {
    baseUrl: string;
    campaignId: string;
    recipientId: string;
    signature: string;
}

/** Rewrites every http(s) href to a signed click-tracking redirect. */
export function rewriteTrackedLinks(html: string, tracking: TrackingConfig): string {
    return html.replace(HREF_PATTERN, (match, url: string) => {
        if (!/^https?:\/\//i.test(url)) return match;

        const tracked =
            `${tracking.baseUrl}/functions/v1/newsletter-track?t=click` +
            `&c=${encodeParam(tracking.campaignId)}` +
            `&r=${encodeParam(tracking.recipientId)}` +
            `&s=${encodeParam(tracking.signature)}` +
            `&u=${encodeParam(url)}`;

        return `href="${tracked}"`;
    });
}

export function openPixel(tracking: TrackingConfig): string {
    return (
        `<img src="${tracking.baseUrl}/functions/v1/newsletter-track?t=open` +
        `&c=${encodeParam(tracking.campaignId)}` +
        `&r=${encodeParam(tracking.recipientId)}` +
        `&s=${encodeParam(tracking.signature)}" ` +
        `width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;" />`
    );
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function alignToText(align: Alignment | undefined): string {
    return align ?? 'left';
}

function blockPadding(px = 16): string {
    return `${px}px 24px`;
}

function renderBlock(block: NewsletterBlock, ctx: RenderContext, design: Required<NewsletterDesign>): string {
    switch (block.type) {
        case 'heading': {
            const level = block.level ?? 2;
            const size = block.fontSize ?? (level === 1 ? 30 : level === 2 ? 24 : 19);
            return `<tr><td style="padding:${blockPadding()};text-align:${alignToText(block.align)};">
        <h${level} style="margin:0;font-family:${design.fontFamily};font-size:${size}px;line-height:1.3;font-weight:700;color:${block.color ?? design.textColor};">${applyVariables(block.text, ctx)}</h${level}>
      </td></tr>`;
        }

        case 'text': {
            const size = block.fontSize ?? 16;
            const lineHeight = block.lineHeight ?? 1.65;
            return `<tr><td style="padding:${blockPadding()};text-align:${alignToText(block.align)};">
        <div style="font-family:${design.fontFamily};font-size:${size}px;line-height:${lineHeight};color:${block.color ?? design.textColor};">${applyVariables(sanitizeHtml(block.html), ctx)}</div>
      </td></tr>`;
        }

        case 'image': {
            const width = block.width ?? design.contentWidth;
            const radius = block.borderRadius ?? 6;
            const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt ?? '')}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${radius}px;margin:0 auto;" />`;
            const wrapped = block.href
                ? `<a href="${escapeHtml(block.href)}" style="text-decoration:none;">${img}</a>`
                : img;

            return `<tr><td style="padding:${block.paddingY ?? 16}px 24px;text-align:${alignToText(block.align)};">${wrapped}</td></tr>`;
        }

        case 'button': {
            const radius = block.borderRadius ?? 6;
            const widthStyle = block.fullWidth ? 'display:block;width:100%;' : 'display:inline-block;';
            return `<tr><td style="padding:${blockPadding()};text-align:${alignToText(block.align)};">
        <a href="${escapeHtml(block.href)}" style="${widthStyle}padding:14px 28px;background-color:${block.bgColor ?? design.buttonBgColor};color:${block.textColor ?? design.buttonTextColor};font-family:${design.fontFamily};font-size:16px;font-weight:600;text-decoration:none;border-radius:${radius}px;">${applyVariables(block.label, ctx)}</a>
      </td></tr>`;
        }

        case 'divider': {
            const width = block.width ?? 100;
            return `<tr><td style="padding:12px 24px;">
        <div style="width:${width}%;height:${block.thickness ?? 1}px;background-color:${block.color ?? '#e5e7eb'};margin:0 auto;"></div>
      </td></tr>`;
        }

        case 'spacer':
            return `<tr><td style="height:${block.height ?? 24}px;line-height:${block.height ?? 24}px;font-size:0;">&nbsp;</td></tr>`;

        case 'video': {
            const href = escapeHtml(block.url);
            const thumb = block.thumbnail
                ? `<img src="${escapeHtml(block.thumbnail)}" alt="${escapeHtml(block.title ?? 'Vídeo')}" width="${design.contentWidth}" style="display:block;width:100%;height:auto;border:0;border-radius:6px;" />`
                : `<div style="background:#111827;color:#ffffff;padding:48px 24px;text-align:center;border-radius:6px;font-family:${design.fontFamily};">▶ Assistir ao vídeo</div>`;

            return `<tr><td style="padding:16px 24px;">
        <a href="${href}" style="text-decoration:none;">${thumb}</a>
        ${block.title ? `<p style="margin:10px 0 0;font-family:${design.fontFamily};font-size:14px;color:${design.textColor};">${escapeHtml(block.title)}</p>` : ''}
      </td></tr>`;
        }

        case 'html':
            // Sanitised, then variables applied. Intended for editor+ roles.
            return `<tr><td style="padding:${blockPadding()};">${applyVariables(sanitizeHtml(block.html), ctx)}</td></tr>`;

        case 'columns': {
            const gap = block.gap ?? 16;
            const columns = Array.isArray(block.columns) ? block.columns : [];
            if (columns.length === 0) return '';

            const cells = columns
                .map((column) => {
                    const inner = (column.blocks ?? [])
                        .map((child) => renderBlock(child, ctx, design))
                        .join('');
                    return `<td width="${100 / columns.length}%" valign="top" style="padding:0 ${gap / 2}px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table>
          </td>`;
                })
                .join('');

            return `<tr><td style="padding:8px ${24 - gap / 2}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="nl-columns"><tr>${cells}</tr></table>
      </td></tr>`;
        }

        default:
            // Unknown block types are skipped rather than leaking raw JSON into the email.
            return '';
    }
}

export interface RenderEmailOptions {
    subject: string;
    previewText?: string | null;
    blocks: NewsletterBlock[];
    design?: NewsletterDesign | null;
    footerHtml?: string | null;
}

/** Renders the inner body table (used for previews and for the full document). */
export function renderBody(
    blocks: NewsletterBlock[],
    ctx: RenderContext,
    design: Required<NewsletterDesign>,
    footerHtml: string | null,
): string {
    const content = (Array.isArray(blocks) ? blocks : []).map((block) => renderBlock(block, ctx, design)).join('');

    const footerParts: string[] = [];
    if (footerHtml) footerParts.push(footerHtml);
    if (ctx.firm.unsubscribeFooter) footerParts.push(`<p style="margin:8px 0 0;">${applyVariables(ctx.firm.unsubscribeFooter, ctx)}</p>`);
    if (ctx.firm.physicalAddress) footerParts.push(`<p style="margin:8px 0 0;color:#6b7280;">${escapeHtml(ctx.firm.physicalAddress)}</p>`);

    if (footerParts.length > 0) {
        footerParts.push(
            `<p style="margin:12px 0 0;color:#6b7280;font-size:12px;">
         <a href="${ctx.urls.unsubscribe}" style="color:#6b7280;">Cancelar inscrição</a>
         ${ctx.firm.privacyPolicyUrl ? ` &middot; <a href="${escapeHtml(ctx.firm.privacyPolicyUrl)}" style="color:#6b7280;">Política de Privacidade</a>` : ''}
       </p>`,
        );
    }

    const footer = `<tr><td style="padding:20px 24px 28px;border-top:1px solid #e5e7eb;font-family:${design.fontFamily};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">${footerParts.join('')}</td></tr>`;

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${content}${footer}</table>`;
}

/**
 * Builds the complete email document.
 *
 * `tracking` is optional: when omitted (preview / test sends) no pixel is added
 * and links are left untouched.
 */
export function renderEmail(options: RenderEmailOptions, ctx: RenderContext, tracking?: TrackingConfig): string {
    const design: Required<NewsletterDesign> = { ...DEFAULT_DESIGN, ...(options.design ?? {}) };

    let body = renderBody(options.blocks, ctx, design, options.footerHtml ?? null);

    if (tracking) {
        body = rewriteTrackedLinks(body, tracking);
    }

    const preheader = options.previewText
        ? `<div style="display:none;font-size:1px;color:${design.contentBackgroundColor};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(options.previewText)}</div>`
        : '';

    const pixel = tracking ? openPixel(tracking) : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(options.subject)}</title>
<style>
  body { margin:0; padding:0; background-color:${design.backgroundColor}; }
  table { border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; }
  a { color:${design.linkColor}; }
  @media only screen and (max-width:640px) {
    .nl-content { width:100% !important; }
    .nl-columns td { display:block !important; width:100% !important; padding:0 0 12px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${design.backgroundColor};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${design.backgroundColor};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" class="nl-content" width="${design.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${design.contentWidth}px;max-width:100%;background-color:${design.contentBackgroundColor};border-radius:${design.borderRadius}px;overflow:hidden;">
        ${body}
      </table>
    </td>
  </tr>
</table>
${pixel}
</body>
</html>`;
}

/** Plain-text alternative, generated so every message is multipart. */
export function renderPlainText(subject: string, blocks: NewsletterBlock[], ctx: RenderContext): string {
    const lines: string[] = [subject, ''];

    const walk = (items: NewsletterBlock[]) => {
        for (const block of items) {
            switch (block.type) {
                case 'heading':
                    lines.push(applyVariables(block.text, ctx).replace(/<[^>]+>/g, ''), '');
                    break;
                case 'text':
                    lines.push(applyVariables(block.html, ctx).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '), '');
                    break;
                case 'button':
                    lines.push(`${applyVariables(block.label, ctx)}: ${block.href}`, '');
                    break;
                case 'image':
                    if (block.href) lines.push(block.href);
                    break;
                case 'video':
                    lines.push(block.url, '');
                    break;
                case 'html':
                    lines.push(sanitizeHtml(block.html).replace(/<[^>]+>/g, ''), '');
                    break;
                case 'columns':
                    for (const column of block.columns ?? []) walk(column.blocks ?? []);
                    break;
                default:
                    break;
            }
        }
    };

    walk(blocks);

    lines.push('', '---', `Cancelar inscrição: ${ctx.urls.unsubscribe}`);
    return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
}

/** Validates a block tree; used by the editor and before sending. */
export function validateBlocks(blocks: NewsletterBlock[]): string[] {
    const issues: string[] = [];

    const walk = (items: NewsletterBlock[], path: string) => {
        if (!Array.isArray(items)) {
            issues.push(`${path}: a lista de blocos é inválida`);
            return;
        }

        items.forEach((block, index) => {
            const where = `${path}[${index}]`;

            switch (block.type) {
                case 'heading':
                    if (!String((block as HeadingBlock).text ?? '').trim()) {
                        issues.push(`${where}: título vazio`);
                    }
                    break;
                case 'text':
                    if (!String((block as TextBlock).html ?? '').trim()) {
                        issues.push(`${where}: bloco de texto vazio`);
                    }
                    break;
                case 'image':
                    if (!/^https?:\/\//i.test((block as ImageBlock).src ?? '')) {
                        issues.push(`${where}: imagem sem URL absoluta`);
                    }
                    break;
                case 'button': {
                    const button = block as ButtonBlock;
                    if (!button.label?.trim()) issues.push(`${where}: botão sem texto`);
                    if (!/^https?:\/\//i.test(button.href ?? '')) issues.push(`${where}: botão sem URL absoluta`);
                    break;
                }
                case 'video':
                    if (!/^https?:\/\//i.test((block as VideoBlock).url ?? '')) {
                        issues.push(`${where}: vídeo sem URL absoluta`);
                    }
                    break;
                case 'columns':
                    (block as ColumnsBlock).columns?.forEach((column, columnIndex) => {
                        walk(column.blocks ?? [], `${where}.columns[${columnIndex}]`);
                    });
                    break;
                default:
                    break;
            }
        });
    };

    walk(Array.isArray(blocks) ? blocks : [], 'blocks');
    return issues;
}
