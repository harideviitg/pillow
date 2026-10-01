import { addDays, dayKey, weekStart } from '../lib/time';
import type { CalItem, Data, Task } from './types';

/** First-run data around the current week, so nothing starts empty. All of it can be deleted. */
export function seedData(now: number): Data {
  const today = dayKey(now);
  const week = weekStart(today);
  const day = (i: number) => addDays(week, i);
  const friday = day(4);
  const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({ id, title, done: false, projectId: null, due: null, createdAt: now, ...extra });
  const event = (id: string, title: string, d: number, start: number, length: number, tone: CalItem['tone']): CalItem => ({
    id,
    kind: 'event',
    taskId: null,
    projectId: null,
    title,
    day: day(d),
    start,
    length,
    tone,
  });

  return {
    version: 1,
    projects: [{ id: 'p-portfolio', name: 'Portfolio site', tone: 'violet', due: friday, createdAt: now }],
    tasks: [
      task('t-flights', 'Book flights to Lisbon', { done: true }),
      task('t-sam', 'Reply to Sam', { due: today }),
      task('t-agenda', 'Draft the Q4 agenda'),
      task('t-passport', 'Renew passport', { due: addDays(today, 2) }),
      task('t-invoice', 'Send the invoice'),
      task('t-offsite', 'Plan the offsite'),
      task('t-font', 'Pick a font', { done: true, projectId: 'p-portfolio' }),
      task('t-case', 'Write the case study', { projectId: 'p-portfolio' }),
      task('t-shots', 'Export screenshots', { projectId: 'p-portfolio' }),
      task('t-ship', 'Ship it', { projectId: 'p-portfolio' }),
    ],
    items: [
      event('e-gym1', 'Gym', 0, 8, 1, 'green'),
      event('e-gym2', 'Gym', 2, 8, 1, 'green'),
      event('e-gym3', 'Gym', 4, 8, 1, 'green'),
      event('e-lunch', 'Lunch with Sam', 1, 13, 1, 'amber'),
      event('e-dentist', 'Dentist', 3, 16, 1, 'coral'),
      { id: 's-case', kind: 'session', taskId: 't-case', projectId: null, title: '', day: today, start: 10, length: 2, tone: 'violet' },
      { id: 's-agenda', kind: 'session', taskId: 't-agenda', projectId: null, title: '', day: addDays(today, 1), start: 14, length: 1.5, tone: 'amber' },
    ],
    nodes: [
      { taskId: 't-font', x: 80, y: 120 },
      { taskId: 't-case', x: 340, y: 120 },
      { taskId: 't-shots', x: 340, y: 220 },
      { taskId: 't-ship', x: 600, y: 170 },
      { taskId: 't-agenda', x: 120, y: 400 },
      { taskId: 't-offsite', x: 400, y: 420 },
    ],
    edges: [
      { id: 'f1', from: 't-font', to: 't-case' },
      { id: 'f2', from: 't-case', to: 't-shots' },
      { id: 'f3', from: 't-case', to: 't-ship' },
      { id: 'f4', from: 't-shots', to: 't-ship' },
      { id: 'f5', from: 't-agenda', to: 't-offsite' },
    ],
  };
}
