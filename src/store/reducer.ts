import type { DayKey } from '../lib/time';
import { TONE_ORDER, type CalItem, type Data, type FlowEdge, type FlowNode, type Project, type Task, type Tone } from './types';

let counter = 0;
export function uid(prefix = 'x'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export type Action =
  | { type: 'addTask'; task: Task; at?: number }
  | { type: 'updateTask'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'removeTask'; id: string }
  | { type: 'addProject'; project: Project }
  | { type: 'updateProject'; id: string; patch: Partial<Omit<Project, 'id'>> }
  /** Makes a project out of tasks; it takes over their places on the calendar and canvas. */
  | { type: 'groupTasks'; project: Project; taskIds: string[] }
  /** Sends a project's tasks back to being loose and removes the project. */
  | { type: 'ungroup'; id: string }
  | { type: 'addItem'; item: CalItem }
  | { type: 'updateItem'; id: string; patch: Partial<Omit<CalItem, 'id'>> }
  | { type: 'removeItem'; id: string }
  | { type: 'setDue'; ref: { kind: 'task' | 'project'; id: string }; due: DayKey | null }
  | { type: 'placeNode'; node: FlowNode }
  | { type: 'moveNodes'; moves: FlowNode[] }
  | { type: 'removeNodes'; taskIds: string[] }
  | { type: 'addEdge'; edge: FlowEdge }
  | { type: 'removeEdge'; id: string }
  | { type: 'batch'; actions: Action[] };

function patch<T extends { id: string }>(list: T[], id: string, change: Partial<T>): T[] {
  let changed = false;
  const next = list.map((x) => {
    if (x.id !== id) return x;
    const keys = Object.keys(change) as (keyof T)[];
    if (keys.every((k) => x[k] === change[k])) return x;
    changed = true;
    return { ...x, ...change };
  });
  return changed ? next : list;
}

export function nextTone(projects: Project[]): Tone {
  return TONE_ORDER[projects.length % TONE_ORDER.length];
}

export function reduce(data: Data, action: Action): Data {
  switch (action.type) {
    case 'addTask': {
      const tasks = [...data.tasks];
      tasks.splice(action.at ?? tasks.length, 0, action.task);
      return { ...data, tasks };
    }
    case 'updateTask': {
      const tasks = patch<Task>(data.tasks, action.id, action.patch);
      return tasks === data.tasks ? data : { ...data, tasks };
    }
    case 'removeTask': {
      if (!data.tasks.some((t) => t.id === action.id)) return data;
      return {
        ...data,
        tasks: data.tasks.filter((t) => t.id !== action.id),
        items: data.items.filter((i) => i.taskId !== action.id),
        nodes: data.nodes.filter((n) => n.taskId !== action.id),
        edges: data.edges.filter((e) => e.from !== action.id && e.to !== action.id),
      };
    }
    case 'addProject':
      return { ...data, projects: [...data.projects, action.project] };
    case 'updateProject': {
      const projects = patch<Project>(data.projects, action.id, action.patch);
      return projects === data.projects ? data : { ...data, projects };
    }
    case 'groupTasks': {
      if (action.taskIds.length === 0) return data;
      const ids = new Set(action.taskIds);
      return {
        ...data,
        projects: [...data.projects, action.project],
        tasks: data.tasks.map((t) => (ids.has(t.id) ? { ...t, projectId: action.project.id } : t)),
      };
    }
    case 'ungroup': {
      if (!data.projects.some((p) => p.id === action.id)) return data;
      return {
        ...data,
        projects: data.projects.filter((p) => p.id !== action.id),
        tasks: data.tasks.map((t) => (t.projectId === action.id ? { ...t, projectId: null } : t)),
        items: data.items.filter((i) => i.projectId !== action.id),
      };
    }
    case 'addItem':
      return { ...data, items: [...data.items, action.item] };
    case 'updateItem': {
      const items = patch<CalItem>(data.items, action.id, action.patch);
      return items === data.items ? data : { ...data, items };
    }
    case 'removeItem':
      return data.items.some((i) => i.id === action.id) ? { ...data, items: data.items.filter((i) => i.id !== action.id) } : data;
    case 'setDue': {
      if (action.ref.kind === 'task') {
        const tasks = patch<Task>(data.tasks, action.ref.id, { due: action.due });
        return tasks === data.tasks ? data : { ...data, tasks };
      }
      const projects = patch<Project>(data.projects, action.ref.id, { due: action.due });
      return projects === data.projects ? data : { ...data, projects };
    }
    case 'placeNode': {
      const others = data.nodes.filter((n) => n.taskId !== action.node.taskId);
      return { ...data, nodes: [...others, action.node] };
    }
    case 'moveNodes': {
      const moves = new Map(action.moves.map((m) => [m.taskId, m]));
      let changed = false;
      const nodes = data.nodes.map((n) => {
        const m = moves.get(n.taskId);
        if (!m || (m.x === n.x && m.y === n.y)) return n;
        changed = true;
        return m;
      });
      return changed ? { ...data, nodes } : data;
    }
    case 'removeNodes': {
      const ids = new Set(action.taskIds);
      if (!data.nodes.some((n) => ids.has(n.taskId))) return data;
      return {
        ...data,
        nodes: data.nodes.filter((n) => !ids.has(n.taskId)),
        edges: data.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
      };
    }
    case 'addEdge': {
      const { from, to } = action.edge;
      if (from === to || data.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return data;
      return { ...data, edges: [...data.edges, action.edge] };
    }
    case 'removeEdge':
      return data.edges.some((e) => e.id === action.id) ? { ...data, edges: data.edges.filter((e) => e.id !== action.id) } : data;
    case 'batch':
      return action.actions.reduce(reduce, data);
  }
}

export function readSaved(raw: unknown): Data | null {
  const d = raw as Partial<Data> | null;
  if (!d || d.version !== 1) return null;
  return [d.tasks, d.projects, d.items, d.nodes, d.edges].every(Array.isArray) ? (d as Data) : null;
}
