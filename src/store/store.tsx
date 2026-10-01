import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { readSaved, reduce, type Action } from './reducer';
import { seedData } from './seed';
import type { Data } from './types';

const KEY = 'pillow:app:v1';
const LIMIT = 100;
const COALESCE_MS = 1200;

export interface History {
  past: Data[];
  present: Data;
  future: Data[];
  /** Quick edits with the same key (typing a title) undo as one step. */
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction = { type: 'do'; action: Action; key?: string; at: number } | { type: 'undo' } | { type: 'redo' };

export function historyReducer(h: History, a: HistoryAction): History {
  if (a.type === 'undo') {
    if (!h.past.length) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
  }
  if (a.type === 'redo') {
    if (!h.future.length) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
  }
  const next = reduce(h.present, a.action);
  if (next === h.present) return h;
  const fold = !!a.key && a.key === h.lastKey && a.at - h.lastAt < COALESCE_MS;
  return { past: fold ? h.past : [...h.past, h.present].slice(-LIMIT), present: next, future: [], lastKey: a.key ?? null, lastAt: a.at };
}

function load(): Data {
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = raw ? readSaved(JSON.parse(raw)) : null;
    if (saved) return saved;
  } catch {
    // Unreadable or unavailable storage: start fresh.
  }
  return seedData(Date.now());
}

interface StoreValue {
  data: Data;
  dispatch: (action: Action, key?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ initial, children }: { initial?: Data; children: ReactNode }) {
  const [history, send] = useReducer(historyReducer, undefined, () => ({ past: [], present: initial ?? load(), future: [], lastKey: null, lastAt: 0 }));
  const data = history.present;

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Keeps working for this session.
    }
  }, [data]);

  const dispatch = useCallback((action: Action, key?: string) => send({ type: 'do', action, key, at: Date.now() }), []);
  const undo = useCallback(() => send({ type: 'undo' }), []);
  const redo = useCallback(() => send({ type: 'redo' }), []);
  const value = useMemo(
    () => ({ data, dispatch, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 }),
    [data, dispatch, undo, redo, history.past.length, history.future.length],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore needs a StoreProvider');
  return v;
}

/** The current time, refreshed every 30 seconds. */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every]);
  return now;
}

/** Small per-browser view settings (canvas position, collapsed projects) kept out of undo. */
export function useViewState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(`pillow:view:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(`pillow:view:${key}`, JSON.stringify(value));
    } catch {
      // Not important.
    }
  }, [key, value]);
  return [value, setValue];
}
