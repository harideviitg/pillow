import type { CalItem, Data, Project, Task, Tone, TrayRef } from './types';

export const projectOf = (data: Data, task: Task): Project | null => (task.projectId ? (data.projects.find((p) => p.id === task.projectId) ?? null) : null);

/** Loose tasks are amber; tasks in a project take its colour. */
export function toneOfTask(data: Data, task: Task): Tone {
  return projectOf(data, task)?.tone ?? 'amber';
}

export function refTitle(data: Data, ref: TrayRef): string {
  if (ref.kind === 'task') return data.tasks.find((t) => t.id === ref.id)?.title ?? '';
  return data.projects.find((p) => p.id === ref.id)?.name ?? '';
}

export function refTone(data: Data, ref: TrayRef): Tone {
  if (ref.kind === 'project') return data.projects.find((p) => p.id === ref.id)?.tone ?? 'violet';
  const task = data.tasks.find((t) => t.id === ref.id);
  return task ? toneOfTask(data, task) : 'amber';
}

/** What a calendar block says: its own title for events, its task or project for sessions. */
export function itemTitle(data: Data, item: CalItem): string {
  if (item.kind === 'event') return item.title;
  if (item.taskId) return data.tasks.find((t) => t.id === item.taskId)?.title ?? item.title;
  if (item.projectId) return data.projects.find((p) => p.id === item.projectId)?.name ?? item.title;
  return item.title;
}

/** Whether the thing a session is for has been ticked off. */
export function itemDone(data: Data, item: CalItem): boolean {
  if (item.taskId) return !!data.tasks.find((t) => t.id === item.taskId)?.done;
  if (item.projectId) {
    const tasks = data.tasks.filter((t) => t.projectId === item.projectId);
    return tasks.length > 0 && tasks.every((t) => t.done);
  }
  return false;
}

export function projectProgress(data: Data, projectId: string): { done: number; total: number } {
  const tasks = data.tasks.filter((t) => t.projectId === projectId);
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}
