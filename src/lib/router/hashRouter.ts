/**
 * Minimal hash router. No dependency, no build-time magic.
 *
 * Why not React Router: the application already exists as a public page with
 * overlay surfaces, and adding a routing dependency to guard three admin
 * surfaces would change the whole rendering model. This module supplies exactly
 * what the guards need — parse the current route, match it, navigate, notify —
 * and stays pure enough to unit-test in Node.
 *
 * Because every value here is derived from `location.hash`, all external input
 * is passed through `normalizePath` before it is compared. Anything that is not
 * a plain path is collapsed, which keeps `#/admin/../admin` and `#//admin` from
 * matching routes they should not.
 */

export interface RouteMatch {
    /** Raw hash as it appears in the URL, e.g. `#/admin?tab=users`. */
    hash: string;
    /** Normalized path without the hash or query, e.g. `/admin`. */
    path: string;
    query: URLSearchParams;
}

/** Collapses duplicate slashes, resolves `.`/`..` and drops the trailing slash. */
export function normalizePath(input: string): string {
    const withLeading = input.startsWith('/') ? input : `/${input}`;
    const segments: string[] = [];

    for (const segment of withLeading.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }

    return segments.length ? `/${segments.join('/')}` : '/';
}

/** Accepts `#/admin`, `/admin` or `admin` and returns `#/admin`. */
export function toHashTarget(path: string): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed === '#') return '#/';
    const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const [pathPart, queryPart] = withoutHash.split('?');
    const hash = `#${normalizePath(pathPart)}`;
    return queryPart ? `${hash}?${queryPart}` : hash;
}

export function parseHash(hash: string | null | undefined): RouteMatch {
    const raw = (hash ?? '').trim();
    const withoutHash = raw.startsWith('#') ? raw.slice(1) : raw;
    const [pathPart = '', queryPart = ''] = withoutHash.split('?');

    return {
        hash: raw,
        path: normalizePath(pathPart),
        query: new URLSearchParams(queryPart),
    };
}

/** Normalized equality: `/admin/` matches `/admin`. */
export function matchesRoute(routePath: string, expectedPath: string): boolean {
    return normalizePath(routePath) === normalizePath(expectedPath);
}

export function buildHash(path: string, query?: Record<string, string | number | undefined>): string {
    const pairs = Object.entries(query ?? {})
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    const base = toHashTarget(path);
    return pairs.length ? `${base}${base.includes('?') ? '&' : '?'}${pairs.join('&')}` : base;
}

export function getCurrentHash(): string {
    if (typeof window === 'undefined') return '';
    return window.location.hash || '';
}

export function readCurrentRoute(): RouteMatch {
    return parseHash(getCurrentHash());
}

/**
 * Navigates to a route.
 *
 * `replace` avoids polluting the history: guards use it when they rewrite
 * `#/admin` into `#/login?redirect=...`, so pressing Back does not bounce the
 * user between the two.
 */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
    if (typeof window === 'undefined') return;

    const target = toHashTarget(path);
    if (window.location.hash === target) return;

    if (options.replace) {
        const { pathname, search } = window.location;
        window.history.replaceState(null, '', `${pathname}${search}${target}`);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        return;
    }

    window.location.hash = target;
}

export function subscribeToRoute(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => { };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
}
