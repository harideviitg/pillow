import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion';

export type Tab = 'today' | 'projects' | 'calendar' | 'routines';

export type Route =
  | { name: 'today' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'calendar' }
  | { name: 'routines' }
  | { name: 'routine'; id: string };

export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === 'projects') return parts[1] ? { name: 'project', id: parts[1] } : { name: 'projects' };
  if (parts[0] === 'routines') return parts[1] ? { name: 'routine', id: parts[1] } : { name: 'routines' };
  if (parts[0] === 'calendar') return { name: 'calendar' };
  return { name: 'today' };
}

export function tabOf(route: Route): Tab {
  if (route.name === 'project') return 'projects';
  if (route.name === 'routine') return 'routines';
  return route.name;
}

export const TAB_HASH: Record<Tab, string> = { today: '#/', projects: '#/projects', calendar: '#/calendar', routines: '#/routines' };

export const projectHash = (id: string) => `#/projects/${encodeURIComponent(id)}`;
export const routineHash = (id: string) => `#/routines/${encodeURIComponent(id)}`;

const listeners = new Set<(route: Route) => void>();

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/** Moves to a hash route, cross-fading between screens where the browser supports it. */
export function navigate(hash: string) {
  if (window.location.hash === hash || (hash === '#/' && !window.location.hash)) return;
  const route = parseHash(hash);
  const apply = () => {
    window.history.pushState(null, '', hash);
    listeners.forEach((fn) => fn(route));
    window.scrollTo?.(0, 0);
  };
  const doc = document as TransitionDocument;
  if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion()) {
    doc.startViewTransition(() => flushSync(apply));
  } else apply();
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    listeners.add(setRoute);
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      listeners.delete(setRoute);
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return route;
}

/** True when a key press belongs to a text field or an open dialog, not a shortcut. */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return true;
  return !!document.querySelector('.modal-backdrop');
}

export function useHotkeys(handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!e.defaultPrevented) handler(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [handler]);
}
