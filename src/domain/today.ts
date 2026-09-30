import { addDays, dayKey, sameDay, startOfDay } from './dates';
import { isDoneOn, routineDay } from './routines';
import type { Block, Data, Project, Routine, Task, Wait } from './types';

export const NEXT_PER_PROJECT = 2;

export interface NextItem {
  task: Task;
  project: Project | null;
  reason: 'overdue' | 'due' | 'next';
}

/** The last time anything happened in a project. */
export function lastActivity(data: Data, project: Project): number {
  let latest = Math.max(project.createdAt, project.leftOffAtUpdated ?? 0);
  for (const t of data.tasks) if (t.projectId === project.id) latest = Math.max(latest, t.createdAt, t.doneAt ?? 0);
  for (const w of data.waits) if (w.projectId === project.id) latest = Math.max(latest, w.since, w.doneAt ?? 0);
  return latest;
}

/** Open projects in your order, which stays put while you tick things off. */
export function activeProjects(data: Data): Project[] {
  return data.projects.filter((p) => !p.archived);
}

/**
 * What to do next: overdue and due-today tasks from anywhere, then the first
 * couple of open tasks from each active project, in project order. Tasks listed in `keep` stay
 * in place after they're ticked so the list doesn't jump under your finger.
 */
export function nextUp(data: Data, now: number, keep: ReadonlySet<string> = new Set()): NextItem[] {
  const today = dayKey(now);
  const byId = new Map(data.projects.map((p) => [p.id, p]));
  const visible = (t: Task) => !t.done || keep.has(t.id);
  const live = (t: Task) => !t.projectId || !byId.get(t.projectId)?.archived;
  const picked = new Set<string>();
  const out: NextItem[] = [];

  const dated = data.tasks
    .filter((t) => visible(t) && live(t) && t.due !== null && t.due <= today)
    .sort((a, b) => a.due!.localeCompare(b.due!));
  for (const task of dated) {
    out.push({ task, project: task.projectId ? (byId.get(task.projectId) ?? null) : null, reason: task.due! < today ? 'overdue' : 'due' });
    picked.add(task.id);
  }

  for (const project of activeProjects(data)) {
    let open = 0;
    for (const task of data.tasks) {
      if (task.projectId !== project.id || picked.has(task.id) || !visible(task)) continue;
      if (open >= NEXT_PER_PROJECT) break;
      out.push({ task, project, reason: 'next' });
      // Kept ticks don't use up a slot, so the next task slides in underneath.
      if (!task.done) open++;
    }
  }
  return out;
}

/** Unfiled tasks, minus any already nagging in Next up. */
export function inbox(data: Data, now: number): Task[] {
  const today = dayKey(now);
  return data.tasks.filter((t) => t.projectId === null && !t.done && !(t.due !== null && t.due <= today));
}

/** Open waiting items, longest waiting first. */
export function waitingOn(data: Data, projectId?: string): Wait[] {
  return data.waits.filter((w) => w.doneAt === null && (projectId === undefined || w.projectId === projectId)).sort((a, b) => a.since - b.since);
}

export function blocksOn(data: Data, day: number): Block[] {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  return data.blocks.filter((b) => b.start < end && b.end > start).sort((a, b) => a.start - b.start);
}

export function shippedToday(data: Data, now: number): Task[] {
  return data.tasks.filter((t) => t.done && t.doneAt !== null && sameDay(t.doneAt, now)).sort((a, b) => a.doneAt! - b.doneAt!);
}

/** Projects with anything done, added or noted today: the ones worth a fresh "left off at". */
export function touchedToday(data: Data, now: number): Project[] {
  const today = (ts: number | null) => ts !== null && sameDay(ts, now);
  return data.projects.filter(
    (p) =>
      !p.archived &&
      (today(p.leftOffAtUpdated) ||
        data.tasks.some((t) => t.projectId === p.id && (today(t.doneAt) || today(t.createdAt))) ||
        data.waits.some((w) => w.projectId === p.id && (today(w.since) || today(w.doneAt)))),
  );
}

/** Start the day in the morning, Shut down in the evening, until each is done. */
export function routineForNow(routines: Routine[], now: number): Routine | null {
  const hour = new Date(now).getHours();
  const kind = hour >= 4 && hour < 12 ? 'start' : hour >= 17 || hour < 4 ? 'shutdown' : null;
  if (!kind) return null;
  const routine = routines.find((r) => r.kind === kind);
  return routine && !isDoneOn(routine, routineDay(now)) ? routine : null;
}
