import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router. Hash URLs work on GitHub Pages (no server rewrites)
 * and offline, so no routing library is needed.
 */
export type Route = 'home' | 'settings';

const ROUTES: Record<string, Route> = { '': 'home', '#/': 'home', '#/settings': 'settings' };

export function parseRoute(hash: string): Route {
  return ROUTES[hash] ?? 'home';
}

export const hrefFor = (route: Route): string => (route === 'home' ? '#/' : `#/${route}`);

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash));
}
