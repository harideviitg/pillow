import { addDays, dayKey } from '../lib/time';
import { reduce } from '../store/reducer';
import { seedData } from '../store/seed';
import type { CalItem, Data, Task } from '../store/types';
import { findTask, freeSlot, offlineBrain, parseDay, parseDuration, parseTime } from './brain';

const NOW = new Date(2026, 9, 1, 10, 40).getTime(); // Thursday 10:40
const today = dayKey(NOW);

async function ask(text: string, data: Data = seedData(NOW)) {
  const reply = await offlineBrain.reply(text, { data, now: NOW });
  const after = reply.steps.reduce((d, s) => reduce(d, s.apply), data);
  return { reply, after };
}

describe('parsing', () => {
  it('reads days', () => {
    expect(parseDay('tomorrow please', today)?.day).toBe(addDays(today, 1));
    expect(parseDay('due friday', today)?.day).toBe(addDays(today, 1));
    expect(parseDay('on thursday', today)?.day).toBe(today);
    expect(parseDay('next thursday', today)?.day).toBe(addDays(today, 7));
    expect(parseDay('next week', today)?.day).toBe('2026-10-05');
    expect(parseDay('my wedding', today)).toBeNull();
  });

  it('reads times and lengths', () => {
    expect(parseTime('at 3pm')?.hour).toBe(15);
    expect(parseTime('at 10:30')?.hour).toBe(10.5);
    expect(parseTime('at 2')?.hour).toBe(14);
    expect(parseDuration('2h')?.hours).toBe(2);
    expect(parseDuration('90 min')?.hours).toBe(1.5);
    expect(parseDuration('half an hour')?.hours).toBe(0.5);
  });

  it('matches tasks loosely', () => {
    const tasks = seedData(NOW).tasks;
    expect(findTask('the q4 agenda', tasks)?.id).toBe('t-agenda');
    expect(findTask('passport', tasks)?.id).toBe('t-passport');
    expect(findTask('walk the dog', tasks)).toBeNull();
  });

  it('finds free time around what is already planned', () => {
    const data = seedData(NOW);
    expect(freeSlot(data, today, 1, 9)).toBe(9);
    expect(freeSlot(data, today, 1, 10)).toBe(12);
  });
});

describe('Pip', () => {
  it('adds a task with a deadline', async () => {
    const { reply, after } = await ask('add call mum due friday');
    expect(reply.steps).toHaveLength(1);
    const task = after.tasks.find((t: Task) => t.title === 'Call mum');
    expect(task?.due).toBe(addDays(today, 1));
  });

  it('blocks time for an existing task', async () => {
    const { after } = await ask('block 2h tomorrow at 10 for the q4 agenda');
    const session = after.items.find((i: CalItem) => i.taskId === 't-agenda' && i.day === addDays(today, 1) && i.start === 10);
    expect(session?.length).toBe(2);
  });

  it('sets a deadline on a task it finds', async () => {
    const { after } = await ask('invoice due monday');
    expect(after.tasks.find((t) => t.id === 't-invoice')?.due).toBe('2026-10-05');
  });

  it('ticks things off and can undo', async () => {
    const data = seedData(NOW);
    const { reply, after } = await ask('done with reply to sam', data);
    expect(after.tasks.find((t) => t.id === 't-sam')?.done).toBe(true);
    const undone = reduce(after, reply.steps[0].revert);
    expect(undone.tasks.find((t) => t.id === 't-sam')?.done).toBe(false);
  });

  it('plans the day into free slots after now', async () => {
    const { reply, after } = await ask('plan my day');
    expect(reply.steps.length).toBeGreaterThan(0);
    const planned = after.items.filter((i) => i.day === today && i.kind === 'session' && i.id !== 's-case');
    expect(planned.every((i) => i.start >= 11)).toBe(true);
  });

  it('answers questions without changing anything', async () => {
    expect((await ask("what's due this week?")).reply.text).toContain('Reply to Sam');
    expect((await ask("what's on today")).reply.text).toContain('Write the case study');
    expect((await ask('tell me a joke')).reply.steps).toHaveLength(0);
  });
});
