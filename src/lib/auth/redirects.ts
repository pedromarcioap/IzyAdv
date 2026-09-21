/**
 * Redirect handling for the login/logout cycle. Pure functions, unit-tested.
 *
 * Why this module exists separately: an open redirect is a phishing primitive.
 * `#/login?redirect=https://evil.example` must never send the browser off-site
 * after a successful login, so the target is validated against a strict
 * internal-path grammar instead of being used as given.
 */

import { APP_ROUTES } from '../router/routes';

/** Where an authenticated user lands when no specific destination was requested. */
export const DEFAULT_AUTHENTICATED_ROUTE = APP_ROUTES.admin;

/** Only `#/path` and `/path` shapes are accepted, with an optional query. */
const INTERNAL_PATH_PATTERN = /^#?\/[A-Za-z0-9._~\-/]*(?:\?[A-Za-z0-9._~%\-+&=:@/]*)?$/;

/**
 * Accepts a hash route (`#/admin`) or a path (`/admin`) and rejects everything
 * that could leave the origin: absolute URLs, protocol-relative URLs
 * (`//evil.tld`), backslash tricks (`/\evil.tld`), and non-http schemes.
 */
export function isSafeInternalPath(value: string | null | undefined): boolean {
    if (!value) return false;
    const candidate = value.trim();
    if (!candidate) return false;
    if (candidate.startsWith('//') || candidate.startsWith('/\\')) return false;
    return INTERNAL_PATH_PATTERN.test(candidate);
}

/** Normalizes an accepted target to the `#/...` form used by the hash router. */
export function toHashRoute(path: string): string {
    const trimmed = path.trim();
    return trimmed.startsWith('#') ? trimmed : `#${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/**
 * Resolves where to go after a successful sign-in.
 * Falls back to the console home for anything that fails validation.
 */
export function resolvePostLoginTarget(
    requestedPath: string | null | undefined,
    fallback: string = DEFAULT_AUTHENTICATED_ROUTE,
): string {
    // Always returned in `#/...` form, including the fallback, so callers never
    // have to care which shape they were handed.
    const fallbackRoute = toHashRoute(fallback);
    if (!isSafeInternalPath(requestedPath)) return fallbackRoute;

    const normalized = toHashRoute(requestedPath as string);
    const loginRoute = toHashRoute(APP_ROUTES.login);
    // Sending the user back to the login page after logging in would loop.
    return normalized.split('?')[0] === loginRoute ? fallbackRoute : normalized;
}

/**
 * Where to go when a guard rejects a request. Carries the original destination
 * so the user lands where they intended after authenticating.
 */
export function buildLoginRedirect(
    requestedPath: string | null | undefined,
    fallback: string = DEFAULT_AUTHENTICATED_ROUTE,
): string {
    const target = isSafeInternalPath(requestedPath) ? toHashRoute(requestedPath as string) : toHashRoute(fallback);
    const loginRoute = toHashRoute(APP_ROUTES.login);
    if (target.split('?')[0] === loginRoute) return loginRoute;
    return `${loginRoute}?redirect=${encodeURIComponent(target)}`;
}

/** Reads `redirect` out of a hash route's query string. */
export function readRedirectParam(query: URLSearchParams | string | null | undefined): string | null {
    if (!query) return null;
    const params = typeof query === 'string' ? new URLSearchParams(query) : query;
    const value = params.get('redirect');
    return value && value.trim() ? value.trim() : null;
}

/** Where to go immediately after a sign-out. */
export function resolvePostLogoutTarget(): string {
    return toHashRoute(APP_ROUTES.home);
}
