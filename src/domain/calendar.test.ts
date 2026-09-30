import {
  addDays,
  atMinutes,
  deadlineHours,
  monthGridDays,
  placeOverlaps,
  rangeTitle,
  roundEvents,
  sampleMeetings,
  snap,
  startOfDay,
  startOfWeek,
} from './calendar';
import { sampleProject } from './seed';
import { HOUR } from './time';

const NOW = new Date(2026, 8, 30, 9, 0).getTime();

describe('calendar dates', () => {
  it('starts weeks on Monday and months on the Monday before the 1st', () => {
    expect(new Date(startOfWeek(NOW)).getDay()).toBe(1);
    expect(new Date(startOfWeek(NOW)).getDate()).toBe(28);
    const grid = monthGridDays(new Date(2026, 9, 15).getTime());
    expect(grid).toHaveLength(42);
    expect(new Date(grid[0]).getDay()).toBe(1);
    expect(new Date(grid[3]).getDate()).toBe(1);
  });

  it('snaps to quarter hours and titles ranges without dashes', () => {
    expect(snap(52, 15)).toBe(45);
    expect(snap(53, 15)).toBe(60);
    expect(rangeTitle('week', NOW)).toBe('28 Sep to 4 Oct 2026');
    expect(rangeTitle('month', NOW)).toBe('September 2026');
  });
});

describe('placeOverlaps', () => {
  const day = startOfDay(NOW);
  const m = (id: string, from: number, to: number) => ({ id, start: atMinutes(day, from * 60), end: atMinutes(day, to * 60) });

  it('puts overlapping meetings side by side and leaves others full width', () => {
    const placed = placeOverlaps([m('a', 9, 10), m('b', 9.5, 11), m('c', 10, 10.5), m('d', 12, 13)]);
    expect(placed.get('a')).toEqual({ col: 0, cols: 2 });
    expect(placed.get('b')).toEqual({ col: 1, cols: 2 });
    expect(placed.get('c')).toEqual({ col: 0, cols: 2 });
    expect(placed.get('d')).toEqual({ col: 0, cols: 1 });
  });
});

describe('round events', () => {
  const project = sampleProject(NOW);

  it('puts the live round window, its deadline and past approvals on the calendar', () => {
    const events = roundEvents([project]);
    const due = events.find((e) => e.kind === 'deadline');
    expect(due).toMatchObject({ roundId: 'r-layout', title: 'Round 2: Layout closes', at: NOW + 18 * HOUR });
    expect(events.find((e) => e.kind === 'window')).toMatchObject({ start: NOW - 30 * HOUR, end: NOW + 18 * HOUR });
    expect(events.find((e) => e.kind === 'approved')).toMatchObject({ roundId: 'r-direction' });
  });

  it('turns a dragged deadline back into whole hours after the start', () => {
    const start = NOW - 30 * HOUR;
    expect(deadlineHours(start, NOW + 20 * HOUR)).toBe(50);
    expect(deadlineHours(start, start - HOUR)).toBe(1);
  });
});

describe('sample meetings', () => {
  it('spreads around today and links to the sample rounds', () => {
    const meetings = sampleMeetings(NOW);
    expect(meetings.some((x) => x.start >= startOfDay(NOW) && x.start < addDays(startOfDay(NOW), 1))).toBe(true);
    expect(meetings.find((x) => x.id === 'm-layout-review')).toMatchObject({ roundId: 'r-layout', attendeeIds: ['anika', 'dev', 'meera'] });
    for (const x of meetings) expect(x.end).toBeGreaterThan(x.start);
  });
});
