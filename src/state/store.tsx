import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { sampleMeetings } from '../domain/calendar';
import { projectReducer, type ProjectAction } from '../domain/reducer';
import { sampleProject } from '../domain/seed';
import type { AppData, Meeting, Project } from '../domain/types';

const STORAGE_KEY = 'lockstep:v1';
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

export type AppAction =
  | { type: 'project'; action: ProjectAction; now: number; projectId?: string }
  | { type: 'createProject'; project: Project }
  | { type: 'switchProject'; projectId: string }
  | { type: 'resetSample'; now: number }
  | { type: 'addMeeting'; meeting: Meeting }
  | { type: 'updateMeeting'; id: string; patch: Partial<Omit<Meeting, 'id'>> }
  | { type: 'removeMeeting'; id: string };

export function appReducer(data: AppData, action: AppAction): AppData {
  switch (action.type) {
    case 'project': {
      const target = action.projectId ?? data.activeProjectId;
      return { ...data, projects: data.projects.map((p) => (p.id === target ? projectReducer(p, action.action, action.now) : p)) };
    }
    case 'createProject':
      return { ...data, projects: [...data.projects, action.project], activeProjectId: action.project.id };
    case 'switchProject':
      return data.projects.some((p) => p.id === action.projectId) ? { ...data, activeProjectId: action.projectId } : data;
    case 'resetSample': {
      const sample = sampleProject(action.now);
      const others = data.projects.filter((p) => p.id !== sample.id);
      const samples = new Set(sampleMeetings(action.now).map((m) => m.id));
      return {
        ...data,
        projects: [sample, ...others],
        activeProjectId: sample.id,
        meetings: [...data.meetings.filter((m) => !samples.has(m.id)), ...sampleMeetings(action.now)],
      };
    }
    case 'addMeeting':
      return { ...data, meetings: [...data.meetings, action.meeting] };
    case 'updateMeeting': {
      let changed = false;
      const meetings = data.meetings.map((m) => {
        if (m.id !== action.id) return m;
        const next = { ...m, ...action.patch };
        if (next.end <= next.start) next.end = next.start + 15 * 60 * 1000;
        changed = true;
        return next;
      });
      return changed ? { ...data, meetings } : data;
    }
    case 'removeMeeting':
      return data.meetings.some((m) => m.id === action.id) ? { ...data, meetings: data.meetings.filter((m) => m.id !== action.id) } : data;
  }
}

export function initialData(now: number): AppData {
  const sample = sampleProject(now);
  return { version: 2, projects: [sample], activeProjectId: sample.id, meetings: sampleMeetings(now) };
}

/** Brings older saved data up to the current shape. */
export function migrate(raw: unknown, now: number): AppData | null {
  const data = raw as { version?: number; projects?: Project[]; activeProjectId?: string; meetings?: Meeting[] } | null;
  if (!data || !Array.isArray(data.projects) || data.projects.length === 0) return null;
  const activeProjectId = data.projects.some((p) => p.id === data.activeProjectId) ? data.activeProjectId! : data.projects[0].id;
  if (data.version === 2 && Array.isArray(data.meetings)) return { version: 2, projects: data.projects, activeProjectId, meetings: data.meetings };
  if (data.version === 1) {
    const hasSample = data.projects.some((p) => p.id === 'monsoon-menu');
    return { version: 2, projects: data.projects, activeProjectId, meetings: hasSample ? sampleMeetings(now) : [] };
  }
  return null;
}

function loadData(now: number): AppData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migrate(JSON.parse(raw), now);
      if (migrated) return migrated;
    }
  } catch {
    // Storage can be unavailable or hold something unreadable; start fresh.
  }
  return initialData(now);
}

export interface History {
  past: AppData[];
  present: AppData;
  future: AppData[];
  /** Consecutive edits with the same key (like typing a title) undo as one step. */
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction = { type: 'do'; action: AppAction; key?: string; at: number } | { type: 'undo' } | { type: 'redo' };

export function historyReducer(h: History, action: HistoryAction): History {
  if (action.type === 'undo') {
    if (h.past.length === 0) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
  }
  if (action.type === 'redo') {
    if (h.future.length === 0) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
  }
  const next = appReducer(h.present, action.action);
  if (next === h.present) return h;
  // Switching projects is navigation, not an edit worth undoing on its own.
  if (action.action.type === 'switchProject') return { ...h, present: next };
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
  data: AppData;
  project: Project;
  dispatch: (action: ProjectAction, projectId?: string) => void;
  appDispatch: (action: AppAction, key?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppData }) {
  const [history, send] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: initial ?? loadData(Date.now()),
    future: [],
    lastKey: null,
    lastAt: 0,
  }));
  const data = history.present;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Nothing to do: the app keeps working for this session.
    }
  }, [data]);

  const appDispatch = useCallback((action: AppAction, key?: string) => send({ type: 'do', action, key, at: Date.now() }), []);
  const dispatch = useCallback(
    (action: ProjectAction, projectId?: string) => send({ type: 'do', action: { type: 'project', action, now: Date.now(), projectId }, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => send({ type: 'undo' }), []);
  const redo = useCallback(() => send({ type: 'redo' }), []);
  const project = data.projects.find((p) => p.id === data.activeProjectId) ?? data.projects[0];
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const value = useMemo(
    () => ({ data, project, dispatch, appDispatch, undo, redo, canUndo, canRedo }),
    [data, project, dispatch, appDispatch, undo, redo, canUndo, canRedo],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore needs a StoreProvider');
  return value;
}

/** Current time, refreshed on an interval so countdowns stay honest. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const align = intervalMs - (Date.now() % intervalMs);
    let id = 0;
    const timeout = window.setTimeout(() => {
      setNow(Date.now());
      id = window.setInterval(() => setNow(Date.now()), intervalMs);
    }, align);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
