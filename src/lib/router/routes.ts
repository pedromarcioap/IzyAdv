/**
 * Route table for the single-page app.
 *
 * The application is served as static files (Vite build), so routes are kept in
 * the URL hash: the server never needs a rewrite rule for `#/admin`, and a hard
 * refresh inside the console cannot 404.
 */

export const APP_ROUTES = {
    home: '/',
    login: '/login',
    admin: '/admin',
    newsletter: '/admin/newsletter',
} as const;

export type AppRouteName = keyof typeof APP_ROUTES;

/** Builds `#/path?query` for a route, with the query already encoded. */
export function routePath(route: (typeof APP_ROUTES)[AppRouteName], query?: Record<string, string | number | undefined>): string {
    const pairs = Object.entries(query ?? {})
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    return pairs.length ? `#${route}?${pairs.join('&')}` : `#${route}`;
}
