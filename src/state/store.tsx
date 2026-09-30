import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { readSaved, reduce, type Action } from '../domain/data';
import { seedData } from '../domain/seed';
import type { Data } from '../domain/types';

const STORAGE_KEY = 'pillow:v1';
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

function load(now: number): Data {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? readSaved(JSON.parse(raw)) : null;
    if (saved) return saved;
  } catch {
    // Storage can be off or hold something unreadable; start fresh.
  }
  return seedData(now);
}

export interface History {
  past: Data[];
  present: Data;
  future: Data[];
  /** Quick edits with the same key (typing in a field) undo as one step. */
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction = { type: 'do'; action: Action; key?: string; at: number } | { type: 'undo' } | { type: 'redo' };

export function historyReducer(h: History, action: HistoryAction): History {
  if (action.type === 'undo') {
    if (h.past.length === 0) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
  }
  if (action.type === 'redo') {
    if (h.future.length === 0) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
  }
  const next = reduce(h.present, action.action);
  if (next === h.present) return h;
  const coalesce = !!action.key && action.key === h.lastKey && action.at - h.lastAt < COALESCE_MS;
  return {
    past: coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: action.key ?? null,
    lastAt: action.at,
  };
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

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: Data }) {
  const [history, send] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: initial ?? load(Date.now()),
    future: [],
    lastKey: null,
    lastAt: 0,
  }));
  const data = history.present;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // The app keeps working for this session.
    }
  }, [data]);

  const dispatch = useCallback((action: Action, key?: string) => send({ type: 'do', action, key, at: Date.now() }), []);
  const undo = useCallback(() => send({ type: 'undo' }), []);
  const redo = useCallback(() => send({ type: 'redo' }), []);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const value = useMemo(() => ({ data, dispatch, undo, redo, canUndo, canRedo }), [data, dispatch, undo, redo, canUndo, canRedo]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore needs a StoreProvider');
  return value;
}

/** The current time, refreshed on an aligned interval. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id = 0;
    const timeout = window.setTimeout(() => {
      setNow(Date.now());
      id = window.setInterval(() => setNow(Date.now()), intervalMs);
    }, intervalMs - (Date.now() % intervalMs));
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
