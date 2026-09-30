import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { projectReducer, type ProjectAction } from '../domain/reducer';
import { sampleProject } from '../domain/seed';
import type { AppData, Project } from '../domain/types';

const STORAGE_KEY = 'lockstep:v1';

export type AppAction =
  | { type: 'project'; action: ProjectAction; now: number }
  | { type: 'createProject'; project: Project }
  | { type: 'switchProject'; projectId: string }
  | { type: 'resetSample'; now: number };

export function appReducer(data: AppData, action: AppAction): AppData {
  switch (action.type) {
    case 'project':
      return {
        ...data,
        projects: data.projects.map((p) => (p.id === data.activeProjectId ? projectReducer(p, action.action, action.now) : p)),
      };
    case 'createProject':
      return { ...data, projects: [...data.projects, action.project], activeProjectId: action.project.id };
    case 'switchProject':
      return data.projects.some((p) => p.id === action.projectId) ? { ...data, activeProjectId: action.projectId } : data;
    case 'resetSample': {
      const sample = sampleProject(action.now);
      const others = data.projects.filter((p) => p.id !== sample.id);
      return { ...data, projects: [sample, ...others], activeProjectId: sample.id };
    }
  }
}

export function initialData(now: number): AppData {
  const sample = sampleProject(now);
  return { version: 1, projects: [sample], activeProjectId: sample.id };
}

function loadData(now: number): AppData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed?.version === 1 && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        const active = parsed.projects.some((p) => p.id === parsed.activeProjectId);
        return active ? parsed : { ...parsed, activeProjectId: parsed.projects[0].id };
      }
    }
  } catch {
    // Storage can be unavailable or hold something unreadable; start fresh.
  }
  return initialData(now);
}

interface StoreValue {
  data: AppData;
  project: Project;
  dispatch: (action: ProjectAction) => void;
  appDispatch: (action: AppAction) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppData }) {
  const [data, appDispatch] = useReducer(appReducer, undefined, () => initial ?? loadData(Date.now()));

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Nothing to do: the app keeps working for this session.
    }
  }, [data]);

  const dispatch = useCallback((action: ProjectAction) => appDispatch({ type: 'project', action, now: Date.now() }), []);
  const project = data.projects.find((p) => p.id === data.activeProjectId) ?? data.projects[0];
  const value = useMemo(() => ({ data, project, dispatch, appDispatch }), [data, project, dispatch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore needs a StoreProvider');
  return value;
}

/** Current time, refreshed every half minute so countdowns stay honest. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
