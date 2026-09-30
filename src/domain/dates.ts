import type { DayKey } from './types';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

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
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function minutesIntoDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

export function atMinutes(day: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d.getTime();
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ts: number): DayKey {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDayKey(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(ts: number, long = false): string {
  return (long ? LONG_WEEKDAYS : WEEKDAYS)[new Date(ts).getDay()];
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatHour(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric' });
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Compact time since something happened: "just now", "12m", "3h", "2d". */
export function elapsed(since: number, now: number): string {
  const ms = Math.max(0, now - since);
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** "Today", "Tomorrow", "Yesterday", a weekday within the week ahead, or a date. */
export function relativeDay(key: DayKey, now: number): string {
  const diff = Math.round((fromDayKey(key) - startOfDay(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return weekdayName(fromDayKey(key));
  return formatDate(fromDayKey(key));
}

/** "28 Sep to 4 Oct", with the year only when it isn't this one. */
export function rangeTitle(days: number[], now: number): string {
  const first = days[0];
  const last = days[days.length - 1];
  const year = new Date(last).getFullYear();
  const suffix = year === new Date(now).getFullYear() ? '' : ` ${year}`;
  if (days.length === 1) return `${weekdayName(first)}, ${formatDate(first)}${suffix}`;
  return `${formatDate(first)} to ${formatDate(last)}${suffix}`;
}

/** Side-by-side columns for overlapping blocks within one day. */
export function placeOverlaps(events: { id: string; start: number; end: number }[]): Map<string, { col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, { col: number; cols: number }>();
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
