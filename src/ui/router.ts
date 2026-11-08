import { useMemo, useSyncExternalStore } from 'react';

/**
 * Minimal hash router. Hash URLs work on GitHub Pages (no server rewrites)
 * and offline, so no routing library is needed.
 */
export type Page = 'home' | 'items' | 'add' | 'gaps' | 'settings';

export type Route =
  | { name: Page }
  | { name: 'item'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'update'; id: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [first, id, action] = parts;
  if (first === 'item' && id) {
    if (action === 'edit') return { name: 'edit', id };
    if (action === 'update') return { name: 'update', id };
    return { name: 'item', id };
  }
  if (first === 'items' || first === 'add' || first === 'gaps' || first === 'settings') return { name: first };
  return { name: 'home' };
}

export const hrefFor = (page: Page): string => (page === 'home' ? '#/' : `#/${page}`);
export const itemHref = (id: string, action?: 'edit' | 'update'): string =>
  `#/item/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

export function navigate(href: string, { replace = false } = {}): void {
  if (replace) {
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseRoute(hash), [hash]);
}

/** The tab a route belongs to, for highlighting the tab bar. */
export function tabFor(route: Route): Page {
  return route.name === 'item' || route.name === 'edit' || route.name === 'update' ? 'items' : route.name;
}
