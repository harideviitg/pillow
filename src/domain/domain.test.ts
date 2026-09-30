import { historyReducer, type History } from '../state/store';
import { parseCapture } from './capture';
import { reduce } from './data';
import { addDays, dayKey, HOUR, MINUTE } from './dates';
import { lastWeek, routineDay, streak, toggleStep } from './routines';
import { seedData } from './seed';
import { breakDue, snooze, touch } from './session';
import { inbox, nextUp, routineForNow, shippedToday, touchedToday, waitingOn } from './today';
import type { Data, Project, Routine, Task } from './types';

// A Wednesday, 9 AM local time.
const NOW = new Date(2026, 8, 30, 9, 0).getTime();

const project = (id: string, name: string, extra: Partial<Project> = {}): Project => ({
  id,
  name,
  leftOffAt: '',
  leftOffAtUpdated: null,
  archived: false,
  createdAt: NOW - 10 * HOUR,
  ...extra,
});

const task = (id: string, projectId: string | null, extra: Partial<Task> = {}): Task => ({
  id,
  text: id,
  projectId,
  done: false,
  doneAt: null,
  due: null,
  createdAt: NOW - 5 * HOUR,
  ...extra,
});

const empty = (): Data => ({ version: 1, projects: [], tasks: [], waits: [], blocks: [], routines: [] });

describe('quick capture', () => {
  const projects = [project('p1', 'Pillow app'), project('p2', 'Portfolio site'), project('p3', 'Old thing', { archived: true })];

  it('files #tags into projects by name, prefix or part of a name', () => {
    expect(parseCapture('fix the nav #pillow', projects, NOW)).toMatchObject({ kind: 'task', text: 'fix the nav', projectId: 'p1' });
    expect(parseCapture('#port export shots', projects, NOW)).toMatchObject({ text: 'export shots', projectId: 'p2' });
    expect(parseCapture('ship #site', projects, NOW)).toMatchObject({ projectId: 'p2' });
  });

  it('leaves unknown and archived tags in the text and sends the item to the inbox', () => {
    expect(parseCapture('call #mum', projects, NOW)).toMatchObject({ text: 'call #mum', projectId: null, unknownTag: 'mum' });
    expect(parseCapture('revive #old', projects, NOW)).toMatchObject({ projectId: null, unknownTag: 'old' });
  });

  it('turns a leading "wait" into a waiting item', () => {
    expect(parseCapture('wait Claude refactor #pillow', projects, NOW)).toMatchObject({ kind: 'wait', text: 'Claude refactor', projectId: 'p1' });
    expect(parseCapture('Waiting on: deploy', projects, NOW)).toMatchObject({ kind: 'wait', text: 'deploy' });
    expect(parseCapture('waitlist signup page', projects, NOW)).toMatchObject({ kind: 'task', text: 'waitlist signup page' });
  });

  it('reads due days', () => {
    expect(parseCapture('invoice !today', projects, NOW)?.due).toBe(dayKey(NOW));
    expect(parseCapture('invoice !tomorrow', projects, NOW)?.due).toBe(dayKey(addDays(NOW, 1)));
    expect(parseCapture('invoice !fri', projects, NOW)?.due).toBe(dayKey(addDays(NOW, 2)));
    expect(parseCapture('invoice !wed', projects, NOW)?.due).toBe(dayKey(NOW));
    expect(parseCapture('wow !nice', projects, NOW)).toMatchObject({ text: 'wow !nice', due: null });
    expect(parseCapture('!monkey business', projects, NOW)).toMatchObject({ text: '!monkey business', due: null });
  });

  it('ignores empty input', () => {
    expect(parseCapture('   ', projects, NOW)).toBeNull();
    expect(parseCapture('#pillow', projects, NOW)).toBeNull();
  });
});

describe('today', () => {
  const data: Data = {
    ...empty(),
    projects: [project('a', 'A'), project('b', 'B', { createdAt: NOW - HOUR }), project('z', 'Z', { archived: true })],
    tasks: [
      task('a1', 'a'),
      task('a2', 'a'),
      task('a3', 'a'),
      task('b1', 'b', { due: dayKey(addDays(NOW, -1)) }),
      task('b2', 'b'),
      task('z1', 'z'),
      task('loose', null),
      task('loose-due', null, { due: dayKey(NOW) }),
      task('done', 'a', { done: true, doneAt: NOW - 2 * HOUR }),
    ],
  };

  it('puts overdue and due tasks first, then two per active project', () => {
    const items = nextUp(data, NOW);
    expect(items.map((i) => [i.task.id, i.reason])).toEqual([
      ['b1', 'overdue'],
      ['loose-due', 'due'],
      ['a1', 'next'],
      ['a2', 'next'],
      ['b2', 'next'],
    ]);
  });

  it('keeps a just-ticked task in place and lets the next one slide in', () => {
    const ticked = reduce(data, { type: 'toggleTask', id: 'a1', now: NOW });
    const ids = nextUp(ticked, NOW, new Set(['a1'])).map((i) => i.task.id);
    expect(ids).toEqual(['b1', 'loose-due', 'a1', 'a2', 'a3', 'b2']);
  });

  it('lists the inbox without tasks already nagging in next up', () => {
    expect(inbox(data, NOW).map((t) => t.id)).toEqual(['loose']);
  });

  it('knows what shipped and which projects were touched today', () => {
    const d = reduce(data, { type: 'toggleTask', id: 'b2', now: NOW });
    expect(shippedToday(d, NOW).map((t) => t.id)).toEqual(['done', 'b2']);
    expect(touchedToday(d, NOW).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('sorts waiting items longest first', () => {
    const d: Data = {
      ...empty(),
      waits: [
        { id: 'new', text: '', projectId: null, since: NOW - MINUTE, doneAt: null },
        { id: 'old', text: '', projectId: null, since: NOW - HOUR, doneAt: null },
        { id: 'gone', text: '', projectId: null, since: NOW - 2 * HOUR, doneAt: NOW },
      ],
    };
    expect(waitingOn(d).map((w) => w.id)).toEqual(['old', 'new']);
  });
});

describe('routines', () => {
  const base = seedData(NOW).routines[0];
  const fresh: Routine = { ...base, completions: [] };
  const today = routineDay(NOW);

  it('completes the day once every step is ticked, and undoes it when one is unticked', () => {
    let r = fresh;
    for (const s of r.steps) r = toggleStep(r, s.id, today);
    expect(r.completions).toEqual([today]);
    r = toggleStep(r, r.steps[0].id, today);
    expect(r.completions).toEqual([]);
  });

  it('counts a streak that survives today not being done yet', () => {
    const days = [1, 2, 3].map((n) => routineDay(NOW - n * 24 * HOUR));
    const r = { ...fresh, completions: days };
    expect(streak(r, NOW)).toBe(3);
    expect(streak({ ...r, completions: [...days, today] }, NOW)).toBe(4);
    expect(streak({ ...r, completions: [days[1], days[2]] }, NOW)).toBe(0);
    expect(lastWeek(r, NOW).map((d) => d.done)).toEqual([false, false, false, true, true, true, false]);
  });

  it('treats 1 AM as the evening before', () => {
    const late = new Date(2026, 9, 1, 1, 0).getTime();
    expect(routineDay(late)).toBe(dayKey(NOW));
  });

  it('shows Start the day in the morning and Shut down in the evening, until done', () => {
    const routines = seedData(NOW).routines;
    expect(routineForNow(routines, NOW)?.kind).toBe('start');
    expect(routineForNow(routines, NOW + 4 * HOUR)).toBeNull();
    const evening = NOW + 11 * HOUR;
    expect(routineForNow(routines, evening)?.kind).toBe('shutdown');
    const done = routines.map((r) => (r.kind === 'shutdown' ? { ...r, completions: [routineDay(evening)] } : r));
    expect(routineForNow(done, evening)).toBeNull();
  });
});

describe('break nudge', () => {
  it('nudges after three hours of continuous work and resets after a real gap', () => {
    let s = touch(null, NOW);
    for (let t = NOW; t <= NOW + 3 * HOUR; t += 10 * MINUTE) s = touch(s, t);
    expect(breakDue(s, NOW + 3 * HOUR)).toBe(true);
    const snoozed = snooze(s, NOW + 3 * HOUR);
    expect(breakDue(snoozed, NOW + 3 * HOUR + 5 * MINUTE)).toBe(false);
    const after = touch(s, NOW + 3 * HOUR + 30 * MINUTE);
    expect(after.start).toBe(NOW + 3 * HOUR + 30 * MINUTE);
    expect(breakDue(after, NOW + 3 * HOUR + 31 * MINUTE)).toBe(false);
  });
});

describe('data', () => {
  const data: Data = { ...empty(), projects: [project('a', 'A'), project('b', 'B')], tasks: [task('a1', 'a'), task('b1', 'b'), task('a2', 'a')] };

  it('reorders within a project and moves between projects', () => {
    const before = reduce(data, { type: 'moveTask', id: 'a2', projectId: 'a', beforeId: 'a1' });
    expect(before.tasks.map((t) => t.id)).toEqual(['a2', 'a1', 'b1']);
    const across = reduce(data, { type: 'moveTask', id: 'a1', projectId: 'b', beforeId: null });
    expect(across.tasks.map((t) => [t.id, t.projectId])).toEqual([
      ['b1', 'b'],
      ['a1', 'b'],
      ['a2', 'a'],
    ]);
    expect(reduce(data, { type: 'moveTask', id: 'a2', projectId: 'a', beforeId: null })).toBe(data);
  });

  it('removes a project with its tasks and keeps its calendar blocks', () => {
    const d = { ...data, blocks: [{ id: 'x', title: '', start: NOW, end: NOW + HOUR, projectId: 'a' }] };
    const next = reduce(d, { type: 'removeProject', id: 'a' });
    expect(next.tasks.map((t) => t.id)).toEqual(['b1']);
    expect(next.blocks[0].projectId).toBeNull();
  });

  it('keeps blocks at least 15 minutes long', () => {
    const d = { ...data, blocks: [{ id: 'x', title: '', start: NOW, end: NOW + HOUR, projectId: null }] };
    expect(reduce(d, { type: 'updateBlock', id: 'x', patch: { end: NOW } }).blocks[0].end).toBe(NOW + 15 * MINUTE);
  });

  it('undoes, redoes and folds quick typing into one step', () => {
    let h: History = { past: [], present: data, future: [], lastKey: null, lastAt: 0 };
    const type = (text: string, at: number) =>
      (h = historyReducer(h, { type: 'do', action: { type: 'updateTask', id: 'a1', patch: { text } }, key: 'a1:text', at }));
    type('F', 100);
    type('Fi', 300);
    type('Fix', 500);
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.tasks[0].text).toBe('a1');
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.tasks[0].text).toBe('Fix');
    h = historyReducer(h, { type: 'do', action: { type: 'removeTask', id: 'missing' }, at: 900 });
    expect(h.past).toHaveLength(1);
  });
});
