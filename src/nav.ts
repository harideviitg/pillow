import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion/easing';

export type Route =
  | { name: 'builder'; roundId: string | null }
  | { name: 'calendar'; meetingId: string | null }
  | { name: 'projects' }
  | { name: 'review'; projectId: string; roundId: string };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'calendar') return { name: 'calendar', meetingId: params.get('m') };
  if (parts[0] === 'review' && parts[1] && parts[2]) return { name: 'review', projectId: parts[1], roundId: parts[2] };
  return { name: 'builder', roundId: params.get('round') };
}

const listeners = new Set<(route: Route) => void>();

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/** Moves to a hash route, cross-fading between screens where the browser supports it. */
export function navigate(hash: string) {
  const route = parseHash(hash);
  const apply = () => {
    window.history.pushState(null, '', hash);
    listeners.forEach((fn) => fn(route));
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

/** True when a key press is meant for a text field or an open dialog, not a shortcut. */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return !!document.querySelector('.modal-backdrop');
}

export function useHotkeys(handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      handler(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [handler]);
}
