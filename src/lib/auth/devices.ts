/**
 * Presentation helpers for the session inventory (pure, unit-tested).
 *
 * The goal is legibility, not device fingerprinting: an operator looking at
 * "Sessões ativas" must be able to tell "that is not me" at a glance. The
 * raw user agent is always shown underneath for the cases the parser guesses
 * wrong.
 */

export interface DeviceDescriptor {
    label: string;
    detail: string;
}

function detectBrowser(userAgent: string): string {
    if (/edg\//i.test(userAgent)) return 'Edge';
    if (/opr\/|opera/i.test(userAgent)) return 'Opera';
    if (/chrome|crios/i.test(userAgent)) return 'Chrome';
    if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
    if (/safari/i.test(userAgent)) return 'Safari';
    if (/curl|postman|insomnia/i.test(userAgent)) return 'Cliente de API';
    return 'Navegador';
}

function detectPlatform(userAgent: string): string {
    if (/windows nt/i.test(userAgent)) return 'Windows';
    if (/android/i.test(userAgent)) return 'Android';
    if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
    if (/mac os x|macintosh/i.test(userAgent)) return 'macOS';
    if (/linux/i.test(userAgent)) return 'Linux';
    return 'Sistema não identificado';
}

export function describeUserAgent(userAgent: string | null | undefined): DeviceDescriptor {
    const raw = (userAgent ?? '').trim();

    if (!raw) {
        return { label: 'Dispositivo não identificado', detail: 'O navegador não enviou o cabeçalho User-Agent.' };
    }

    return {
        label: `${detectBrowser(raw)} • ${detectPlatform(raw)}`,
        detail: raw,
    };
}

/** Formats an ISO timestamp for the session table, tolerating null. */
export function formatSessionMoment(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

/**
 * Human-readable form of the remaining lifetime of a session, based on the
 * Access Token expiry. Returns null when the moment is unknown, which the UI
 * renders as "—" instead of inventing a duration.
 */
export function describeExpiry(expiresAtSeconds: number | null | undefined, now: Date = new Date()): string | null {
    if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) return null;

    const remainingMs = expiresAtSeconds * 1000 - now.getTime();
    if (remainingMs <= 0) return 'Expirado';

    const minutes = Math.floor(remainingMs / 60_000);
    if (minutes < 60) return `expira em ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `expira em ${hours} h`;

    return `expira em ${Math.floor(hours / 24)} dia(s)`;
}
