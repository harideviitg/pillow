import { roundKindDef } from './catalog';
import { DAY, HOUR } from './time';
import type { Meeting, MeetingKind, Project } from './types';

export const MINUTE = 60 * 1000;

export const MEETING_KINDS: { id: MeetingKind; label: string }[] = [
  { id: 'review', label: 'Review call' },
  { id: 'client', label: 'Client meeting' },
  { id: 'internal', label: 'Internal' },
];

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Weeks start on Monday. */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
}

export function addMonths(ts: number, months: number): number {
  const d = new Date(startOfMonth(ts));
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** The 42 days shown in a month grid, starting on the Monday on or before the 1st. */
export function monthGridDays(ts: number): number[] {
  const first = startOfWeek(startOfMonth(ts));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function minutesIntoDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

export function atMinutes(dayStart: number, minutes: number): number {
  const d = new Date(dayStart);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d.getTime();
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayName(ts: number): string {
  return WEEKDAYS[new Date(ts).getDay()];
}

export function monthName(ts: number, long = false): string {
  const m = new Date(ts).getMonth();
  return long ? LONG_MONTHS[m] : MONTHS[m];
}

export function formatTime(ts: number, timeZone?: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
}

export function formatHour(ts: number, timeZone?: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', timeZone });
}

export function formatClock(ts: number, timeZone?: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone, hour12: false });
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} to ${formatTime(end)}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDayLong(ts: number): string {
  const d = new Date(ts);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function rangeTitle(view: 'day' | 'week' | 'month', anchor: number): string {
  const d = new Date(anchor);
  if (view === 'month') return `${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (view === 'day') return `${formatDayLong(anchor)} ${d.getFullYear()}`;
  const start = new Date(startOfWeek(anchor));
  const end = new Date(addDays(start.getTime(), 6));
  const left = `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  const right = `${end.getDate()} ${MONTHS[end.getMonth()]}`;
  return `${left} to ${right} ${end.getFullYear()}`;
}

export function zoneName(timeZone: string, at: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(at));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Hour of the day (0 to 23.99) at an instant in a given zone. */
export function hourInZone(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
}

export function isWorkingHours(ts: number, timeZone: string): boolean {
  const h = hourInZone(ts, timeZone);
  return h >= 9 && h < 19;
}

export interface Placed {
  col: number;
  cols: number;
}

/** Side-by-side columns for overlapping events within one day. */
export function placeOverlaps(events: { id: string; start: number; end: number }[]): Map<string, Placed> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, Placed>();
  let cluster: { id: string; col: number }[] = [];
  let clusterEnd = -Infinity;
  let colEnds: number[] = [];

  const flush = () => {
    const cols = Math.max(1, colEnds.length);
    for (const item of cluster) result.set(item.id, { col: item.col, cols });
    cluster = [];
    colEnds = [];
  };

  for (const e of sorted) {
    if (e.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((end) => end <= e.start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(e.end);
    } else colEnds[col] = e.end;
    cluster.push({ id: e.id, col });
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush();
  return result;
}

export type RoundEvent =
  | { id: string; kind: 'deadline'; projectId: string; roundId: string; at: number; title: string; project: string; editable: boolean }
  | { id: string; kind: 'window'; projectId: string; roundId: string; start: number; end: number; title: string; project: string }
  | { id: string; kind: 'approved'; projectId: string; roundId: string; at: number; title: string; project: string };

/** Dates the review flows put on the calendar: live round windows, deadlines and approvals. */
export function roundEvents(projects: Project[]): RoundEvent[] {
  const out: RoundEvent[] = [];
  for (const project of projects) {
    project.rounds.forEach((round, i) => {
      const title = `Round ${i + 1}: ${roundKindDef(round.kind).label}`;
      if (round.state === 'live' && round.startedAt !== null) {
        if (round.closesAfterHours !== null) {
          const due = round.startedAt + round.closesAfterHours * HOUR;
          out.push({ id: `window:${round.id}`, kind: 'window', projectId: project.id, roundId: round.id, start: round.startedAt, end: due, title, project: project.client });
          out.push({ id: `due:${round.id}`, kind: 'deadline', projectId: project.id, roundId: round.id, at: due, title: `${title} closes`, project: project.client, editable: true });
        }
      }
      if (round.state === 'done' && round.approvedAt !== null) {
        out.push({ id: `approved:${round.id}`, kind: 'approved', projectId: project.id, roundId: round.id, at: round.approvedAt, title: `${title} approved`, project: project.client });
      }
    });
  }
  return out;
}

/** Hours from a round's start to a new due time, as the deadline rule stores it. */
export function deadlineHours(startedAt: number, due: number): number {
  return Math.max(1, Math.round((due - startedAt) / HOUR));
}

export function meetingsOnDay(meetings: Meeting[], day: number): Meeting[] {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  return meetings.filter((m) => m.start < end && m.end > start).sort((a, b) => a.start - b.start);
}

/** A few meetings around today so the calendar has something to show. */
export function sampleMeetings(now: number): Meeting[] {
  const today = startOfDay(now);
  const at = (days: number, hour: number, minute = 0) => atMinutes(addDays(today, days), hour * 60 + minute);
  const base = { link: '', notes: '' };
  return [
    { ...base, id: 'm-standup', title: 'Studio stand-up', kind: 'internal', start: at(0, 10), end: at(0, 10, 30), attendeeIds: [], projectId: null, roundId: null },
    {
      ...base,
      id: 'm-copy-walk',
      title: 'Menu copy walkthrough',
      kind: 'client',
      start: at(0, 16),
      end: at(0, 16, 45),
      attendeeIds: ['dev'],
      projectId: 'monsoon-menu',
      roundId: 'r-copy',
    },
    {
      ...base,
      id: 'm-layout-review',
      title: 'Layout review call',
      kind: 'review',
      start: at(1, 15),
      end: at(1, 15, 45),
      attendeeIds: ['anika', 'dev', 'meera'],
      projectId: 'monsoon-menu',
      roundId: 'r-layout',
      notes: 'Walk through version 3 before Anika decides.',
    },
    {
      ...base,
      id: 'm-moodboard',
      title: 'Imagery moodboard',
      kind: 'internal',
      start: at(2, 11, 30),
      end: at(2, 12, 30),
      attendeeIds: [],
      projectId: 'monsoon-menu',
      roundId: 'r-polish',
    },
    {
      ...base,
      id: 'm-meera',
      title: 'Check-in with Meera',
      kind: 'client',
      start: at(3, 14, 30),
      end: at(3, 15),
      attendeeIds: ['meera'],
      projectId: 'monsoon-menu',
      roundId: null,
    },
  ];
}

export function nextHalfHour(now: number): number {
  const minutes = Math.ceil(minutesIntoDay(now) / 30) * 30;
  return atMinutes(startOfDay(now), minutes);
}

export { DAY, HOUR };
