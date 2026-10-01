/** A local calendar day, YYYY-MM-DD. */
export type DayKey = string;

/** Times of day are decimal hours: 10.5 is 10:30. */
export const SNAP = 0.25;
export const HOUR_PX = 60;

export function snap(hour: number): number {
  return Math.round(hour / SNAP) * SNAP;
}

/** Keeps a block of `length` hours inside the day. */
export function clampStart(start: number, length: number, first = 0, last = 24): number {
  return Math.min(Math.max(start, first), last - length);
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const twelve = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? 'AM' : 'PM';
  return m === 0 ? `${twelve} ${suffix}` : `${twelve}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(start: number, length: number): string {
  return `${formatHour(start)} – ${formatHour(start + length)}`;
}

export function formatLength(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return Number.isInteger(hours) ? `${hours}h` : `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date: Date | number): DayKey {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Weeks start on Monday. */
export function weekStart(key: DayKey): DayKey {
  const d = fromKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const weekday = (key: DayKey, long = false) => (long ? LONG_WEEKDAYS : WEEKDAYS)[fromKey(key).getDay()];
export const dayLabel = (key: DayKey) => `${weekday(key)} ${fromKey(key).getDate()}`;
export const monthLabel = (key: DayKey) => `${MONTHS[fromKey(key).getMonth()]} ${fromKey(key).getFullYear()}`;
export const shortDate = (key: DayKey) => `${fromKey(key).getDate()} ${MONTHS[fromKey(key).getMonth()].slice(0, 3)}`;

/** How a due day reads next to a task: Today, Tomorrow, Fri, 12 Oct, or Overdue. */
export function dueLabel(key: DayKey, today: DayKey): string {
  const diff = daysBetween(today, key);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return weekday(key);
  return shortDate(key);
}

export function hourOf(date: Date | number): number {
  const d = new Date(date);
  return d.getHours() + d.getMinutes() / 60;
}
