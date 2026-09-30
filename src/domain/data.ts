import { MINUTE } from './dates';
import { completeAll, toggleStep } from './routines';
import type { Block, Data, DayKey, Project, Routine, Task, Wait } from './types';

export type Action =
  | { type: 'addTask'; task: Task }
  | { type: 'updateTask'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'toggleTask'; id: string; now: number }
  | { type: 'removeTask'; id: string }
  /** Moves a task into a project's list, before `beforeId` or at the end. */
  | { type: 'moveTask'; id: string; projectId: string | null; beforeId: string | null }
  | { type: 'addWait'; wait: Wait }
  | { type: 'updateWait'; id: string; patch: Partial<Omit<Wait, 'id'>> }
  | { type: 'clearWait'; id: string; now: number }
  | { type: 'removeWait'; id: string }
  | { type: 'addProject'; project: Project }
  | { type: 'updateProject'; id: string; patch: Partial<Omit<Project, 'id'>> }
  | { type: 'removeProject'; id: string }
  | { type: 'moveProject'; id: string; beforeId: string | null }
  | { type: 'addBlock'; block: Block }
  | { type: 'updateBlock'; id: string; patch: Partial<Omit<Block, 'id'>> }
  | { type: 'removeBlock'; id: string }
  | { type: 'addRoutine'; routine: Routine }
  | { type: 'updateRoutine'; id: string; patch: Partial<Omit<Routine, 'id'>> }
  | { type: 'removeRoutine'; id: string }
  | { type: 'toggleStep'; id: string; stepId: string; day: DayKey }
  | { type: 'completeRoutine'; id: string; day: DayKey };

/** Replaces one item by id; returns the same array when nothing matched or changed. */
function patchById<T extends { id: string }>(list: T[], id: string, change: (item: T) => T): T[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.id !== id) return item;
    const updated = change(item);
    if (updated !== item) changed = true;
    return updated;
  });
  return changed ? next : list;
}

function without<T extends { id: string }>(list: T[], id: string): T[] {
  return list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list;
}

const merge = <T,>(patch: Partial<T>) => (item: T): T => {
  const keys = Object.keys(patch) as (keyof T)[];
  return keys.some((k) => item[k] !== patch[k]) ? { ...item, ...patch } : item;
};

/** Moves an item before another (or to the end); the same array back when nothing moves. */
export function moveBefore<T extends { id: string }>(list: T[], id: string, beforeId: string | null): T[] {
  const item = list.find((x) => x.id === id);
  if (!item || beforeId === id) return list;
  const rest = list.filter((x) => x.id !== id);
  const index = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1;
  const next = index < 0 ? [...rest, item] : [...rest.slice(0, index), item, ...rest.slice(index)];
  return next.every((x, i) => x === list[i]) ? list : next;
}

function moveTask(tasks: Task[], id: string, projectId: string | null, beforeId: string | null): Task[] {
  const task = tasks.find((t) => t.id === id);
  if (!task || beforeId === id) return tasks;
  const rest = tasks.filter((t) => t.id !== id);
  const moved = { ...task, projectId };
  let index = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
  if (index < 0) {
    // At the end of that project's list, which may sit mid-array.
    let last = -1;
    rest.forEach((t, i) => {
      if (t.projectId === projectId) last = i;
    });
    index = last < 0 ? rest.length : last + 1;
  }
  const next = [...rest.slice(0, index), moved, ...rest.slice(index)];
  // Same list, same order: nothing worth an undo step.
  const order = (list: Task[]) => list.filter((t) => t.projectId === projectId).map((t) => t.id).join();
  return task.projectId === projectId && order(next) === order(tasks) ? tasks : next;
}

export function reduce(data: Data, action: Action): Data {
  switch (action.type) {
    case 'addTask':
      return { ...data, tasks: [...data.tasks, action.task] };
    case 'updateTask': {
      const tasks = patchById(data.tasks, action.id, merge<Task>(action.patch));
      return tasks === data.tasks ? data : { ...data, tasks };
    }
    case 'toggleTask': {
      const tasks = patchById(data.tasks, action.id, (t) => ({ ...t, done: !t.done, doneAt: t.done ? null : action.now }));
      return tasks === data.tasks ? data : { ...data, tasks };
    }
    case 'removeTask': {
      const tasks = without(data.tasks, action.id);
      return tasks === data.tasks ? data : { ...data, tasks };
    }
    case 'moveTask': {
      const tasks = moveTask(data.tasks, action.id, action.projectId, action.beforeId);
      return tasks === data.tasks ? data : { ...data, tasks };
    }
    case 'addWait':
      return { ...data, waits: [...data.waits, action.wait] };
    case 'updateWait': {
      const waits = patchById(data.waits, action.id, merge<Wait>(action.patch));
      return waits === data.waits ? data : { ...data, waits };
    }
    case 'clearWait': {
      const waits = patchById(data.waits, action.id, (w) => (w.doneAt === null ? { ...w, doneAt: action.now } : w));
      return waits === data.waits ? data : { ...data, waits };
    }
    case 'removeWait': {
      const waits = without(data.waits, action.id);
      return waits === data.waits ? data : { ...data, waits };
    }
    case 'addProject':
      // New projects go on top, where you'll look for them.
      return { ...data, projects: [action.project, ...data.projects] };
    case 'updateProject': {
      const projects = patchById(data.projects, action.id, merge<Project>(action.patch));
      return projects === data.projects ? data : { ...data, projects };
    }
    case 'removeProject': {
      if (!data.projects.some((p) => p.id === action.id)) return data;
      return {
        ...data,
        projects: data.projects.filter((p) => p.id !== action.id),
        tasks: data.tasks.filter((t) => t.projectId !== action.id),
        waits: data.waits.filter((w) => w.projectId !== action.id),
        blocks: data.blocks.map((b) => (b.projectId === action.id ? { ...b, projectId: null } : b)),
      };
    }
    case 'moveProject': {
      const projects = moveBefore(data.projects, action.id, action.beforeId);
      return projects === data.projects ? data : { ...data, projects };
    }
    case 'addBlock':
      return { ...data, blocks: [...data.blocks, action.block] };
    case 'updateBlock': {
      const blocks = patchById(data.blocks, action.id, (b) => {
        const next = merge<Block>(action.patch)(b);
        // Blocks are at least 15 minutes long.
        return next.end - next.start < 15 * MINUTE ? { ...next, end: next.start + 15 * MINUTE } : next;
      });
      return blocks === data.blocks ? data : { ...data, blocks };
    }
    case 'removeBlock': {
      const blocks = without(data.blocks, action.id);
      return blocks === data.blocks ? data : { ...data, blocks };
    }
    case 'addRoutine':
      return { ...data, routines: [...data.routines, action.routine] };
    case 'updateRoutine': {
      const routines = patchById(data.routines, action.id, merge<Routine>(action.patch));
      return routines === data.routines ? data : { ...data, routines };
    }
    case 'removeRoutine': {
      const routines = without(data.routines, action.id);
      return routines === data.routines ? data : { ...data, routines };
    }
    case 'toggleStep': {
      const routines = patchById(data.routines, action.id, (r) => toggleStep(r, action.stepId, action.day));
      return routines === data.routines ? data : { ...data, routines };
    }
    case 'completeRoutine': {
      const routines = patchById(data.routines, action.id, (r) => completeAll(r, action.day));
      return routines === data.routines ? data : { ...data, routines };
    }
  }
}

/** Accepts saved data only when it has the shape this version writes. */
export function readSaved(raw: unknown): Data | null {
  const d = raw as Partial<Data> | null;
  if (!d || d.version !== 1) return null;
  const lists = [d.projects, d.tasks, d.waits, d.blocks, d.routines];
  return lists.every(Array.isArray) ? (d as Data) : null;
}
