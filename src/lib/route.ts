import { useEffect, useState } from 'react';

export type Page = 'plan' | 'flows' | 'agent';

export interface Route {
  page: Page;
  /** A project to bring into view on the canvas. */
  project: string | null;
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page: Page = path === 'flows' || path === 'agent' ? path : 'plan';
  return { page, project: new URLSearchParams(query).get('project') };
}

export function go(hash: string) {
  if (window.location.hash !== hash) window.location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** True when a key press belongs to a text field rather than a shortcut. */
export function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, [contenteditable="true"]');
}
