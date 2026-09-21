import { useEffect, useState } from 'react';
import { getCurrentHash, parseHash, subscribeToRoute, type RouteMatch } from './hashRouter';

/**
 * Subscribes a component to the hash route.
 *
 * The listener is registered on mount and removed on unmount; the initial value
 * is computed during render so the first paint already shows the right surface
 * instead of flashing the public page before redirecting.
 */
export function useHashRoute(): RouteMatch {
    const [route, setRoute] = useState<RouteMatch>(() => parseHash(getCurrentHash()));

    useEffect(() => {
        const sync = () => setRoute(parseHash(getCurrentHash()));

        // Re-sync on mount: the hash may have changed between render and effect.
        sync();
        return subscribeToRoute(sync);
    }, []);

    return route;
}
