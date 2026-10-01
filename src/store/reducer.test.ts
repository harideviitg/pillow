import { addDays, dayKey, dueLabel, formatHour, formatRange, weekStart } from '../lib/time';
import { placeBlocks } from '../lib/layout';
import { historyReducer, type History } from './store';
import { reduce } from './reducer';
import { seedData } from './seed';
import type { Project } from './types';

const NOW = new Date(2026, 9, 1, 10, 40).getTime(); // a Thursday
const seed = () => seedData(NOW);
const project = (id: string): Project => ({ id, name: id, tone: 'green', due: null, createdAt: NOW });

describe('time', () => {
  it('formats hours and ranges', () => {
    expect(formatHour(9)).toBe('9 AM');
    expect(formatHour(13.5)).toBe('1:30 PM');
    expect(formatRange(11, 1.5)).toBe('11 AM – 12:30 PM');
  });

  it('works out weeks and due labels', () => {
    const today = dayKey(NOW);
    expect(weekStart(today)).toBe('2026-09-28');
    expect(dueLabel(today, today)).toBe('Today');
    expect(dueLabel(addDays(today, 1), today)).toBe('Tomorrow');
    expect(dueLabel(addDays(today, 2), today)).toBe('Sat');
    expect(dueLabel(addDays(today, -1), today)).toBe('Overdue');
  });

  it('lays out overlapping blocks', () => {
    const places = placeBlocks([
      { id: 'a', start: 10, length: 2 },
      { id: 'b', start: 10.25, length: 1 },
      { id: 'c', start: 11, length: 1 },
    ]);
    expect(places.get('a')).toEqual({ depth: 0, lane: 0, lanes: 2 });
    expect(places.get('b')).toEqual({ depth: 0, lane: 1, lanes: 2 });
    expect(places.get('c')?.depth).toBe(1);
  });
});

describe('reducer', () => {
  it('groups tasks into a project and ungroups them again', () => {
    const grouped = reduce(seed(), { type: 'groupTasks', project: project('p-new'), taskIds: ['t-agenda', 't-offsite'] });
    expect(grouped.tasks.filter((t) => t.projectId === 'p-new').map((t) => t.id)).toEqual(['t-agenda', 't-offsite']);
    const withSession = reduce(grouped, {
      type: 'addItem',
      item: { id: 's1', kind: 'session', taskId: null, projectId: 'p-new', title: '', day: dayKey(NOW), start: 9, length: 1, tone: 'green' },
    });
    const back = reduce(withSession, { type: 'ungroup', id: 'p-new' });
    expect(back.projects.some((p) => p.id === 'p-new')).toBe(false);
    expect(back.tasks.find((t) => t.id === 't-agenda')?.projectId).toBeNull();
    expect(back.items.some((i) => i.id === 's1')).toBe(false);
  });

  it('removes a task along with its sessions, card and arrows', () => {
    const next = reduce(seed(), { type: 'removeTask', id: 't-case' });
    expect(next.items.some((i) => i.taskId === 't-case')).toBe(false);
    expect(next.nodes.some((n) => n.taskId === 't-case')).toBe(false);
    expect(next.edges.some((e) => e.from === 't-case' || e.to === 't-case')).toBe(false);
  });

  it('refuses duplicate, reversed and self arrows', () => {
    const data = seed();
    expect(reduce(data, { type: 'addEdge', edge: { id: 'x', from: 't-font', to: 't-case' } })).toBe(data);
    expect(reduce(data, { type: 'addEdge', edge: { id: 'x', from: 't-case', to: 't-font' } })).toBe(data);
    expect(reduce(data, { type: 'addEdge', edge: { id: 'x', from: 't-ship', to: 't-ship' } })).toBe(data);
    expect(reduce(data, { type: 'addEdge', edge: { id: 'x', from: 't-ship', to: 't-agenda' } }).edges).toHaveLength(data.edges.length + 1);
  });

  it('sets deadlines on tasks and projects', () => {
    const due = addDays(dayKey(NOW), 3);
    expect(reduce(seed(), { type: 'setDue', ref: { kind: 'task', id: 't-invoice' }, due }).tasks.find((t) => t.id === 't-invoice')?.due).toBe(due);
    expect(reduce(seed(), { type: 'setDue', ref: { kind: 'project', id: 'p-portfolio' }, due: null }).projects[0].due).toBeNull();
  });

  it('taking cards off the canvas keeps the tasks', () => {
    const next = reduce(seed(), { type: 'removeNodes', taskIds: ['t-agenda'] });
    expect(next.nodes.some((n) => n.taskId === 't-agenda')).toBe(false);
    expect(next.tasks.some((t) => t.id === 't-agenda')).toBe(true);
  });

  it('undoes and folds a drag into one step', () => {
    let h: History = { past: [], present: seed(), future: [], lastKey: null, lastAt: 0 };
    const move = (x: number, at: number) =>
      (h = historyReducer(h, { type: 'do', action: { type: 'moveNodes', moves: [{ taskId: 't-font', x, y: 0 }] }, key: 'move-cards', at }));
    move(1, 100);
    move(2, 200);
    move(3, 300);
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.nodes.find((n) => n.taskId === 't-font')?.x).toBe(80);
  });
});
