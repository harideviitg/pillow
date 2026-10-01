export type Tone = 'green' | 'blue' | 'violet' | 'amber' | 'coral';

export const TONES: Record<Tone, { bar: string; fill: string; ink: string }> = {
  green: { bar: '#2e9b5f', fill: '#dff2e6', ink: '#1d5e3a' },
  blue: { bar: '#3b7be8', fill: '#dfe9fb', ink: '#1f4a94' },
  violet: { bar: '#7a5ae0', fill: '#ebe4fb', ink: '#4a3294' },
  amber: { bar: '#d98b1a', fill: '#fbecd2', ink: '#7a4b08' },
  coral: { bar: '#e8604c', fill: '#fde3dd', ink: '#8c2f20' },
};

/** Times are hours as decimals: 10.5 is 10:30. */
export interface CalEvent {
  id: string;
  day: number;
  start: number;
  length: number;
  title: string;
  tone: Tone;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  list: 'today' | 'upcoming';
}

/** An hour range painted as free in one-off scheduling. */
export interface FreeWindow {
  id: string;
  day: number;
  start: number;
  length: number;
}

export const SNAP = 0.25;
export const FIRST_HOUR = 8;
export const LAST_HOUR = 18;
export const HOUR_PX = 60;
export const DAYS = ['Mon 21', 'Tue 22', 'Wed 23', 'Thu 24', 'Fri 25'];
export const TODAY = 2;
export const NOW_HOUR = 10 + 10 / 60;
export const SHARE_LINK = 'pillow.app/@you/k3v9x';

export const INITIAL_WINDOWS: FreeWindow[] = [
  { id: 'w1', day: 1, start: 13, length: 2 },
  { id: 'w2', day: 3, start: 9.5, length: 1.5 },
];

export const INITIAL_EVENTS: CalEvent[] = [
  { id: 'e1', day: 0, start: 9, length: 0.5, title: 'Standup', tone: 'blue' },
  { id: 'e2', day: 0, start: 11, length: 1.5, title: 'Roadmap review', tone: 'violet' },
  { id: 'e3', day: 0, start: 13, length: 1, title: 'Lunch with Sam', tone: 'amber' },
  { id: 'e4', day: 1, start: 9, length: 0.5, title: 'Standup', tone: 'blue' },
  { id: 'e5', day: 1, start: 10, length: 2, title: 'Deep work', tone: 'green' },
  { id: 'e6', day: 1, start: 15, length: 1, title: 'Interview: design', tone: 'coral' },
  { id: 'e7', day: 2, start: 9, length: 0.5, title: 'Standup', tone: 'blue' },
  { id: 'e8', day: 2, start: 12, length: 1, title: '1:1 with Ana', tone: 'coral' },
  { id: 'e9', day: 2, start: 14, length: 1.5, title: 'Design review', tone: 'violet' },
  { id: 'e10', day: 3, start: 9, length: 0.5, title: 'Standup', tone: 'blue' },
  { id: 'e11', day: 3, start: 11, length: 1, title: 'Call the Tokyo team', tone: 'blue' },
  { id: 'e12', day: 3, start: 14, length: 1.5, title: 'Focus time', tone: 'green' },
  { id: 'e13', day: 4, start: 9, length: 0.5, title: 'Standup', tone: 'blue' },
  { id: 'e14', day: 4, start: 10.5, length: 1, title: 'Gym', tone: 'green' },
  { id: 'e15', day: 4, start: 16, length: 1, title: 'Drinks', tone: 'amber' },
];

export const INITIAL_TASKS: Task[] = [
  { id: 't1', title: 'Book flights to Lisbon', done: true, list: 'today' },
  { id: 't2', title: 'Reply to Sam', done: false, list: 'today' },
  { id: 't3', title: 'Draft the Q4 agenda', done: false, list: 'today' },
  { id: 't4', title: 'Renew passport', done: false, list: 'today' },
  { id: 't5', title: 'Send the invoice', done: false, list: 'upcoming' },
  { id: 't6', title: 'Plan the offsite', done: false, list: 'upcoming' },
];

let counter = 100;
export const nextId = (prefix: string) => `${prefix}${counter++}`;

export function snap(hour: number): number {
  return Math.round(hour / SNAP) * SNAP;
}

/** Keeps a block of `length` hours inside the visible day. */
export function clampStart(start: number, length: number): number {
  return Math.min(Math.max(start, FIRST_HOUR), LAST_HOUR - length);
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const twelve = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? 'AM' : 'PM';
  return m === 0 ? `${twelve} ${suffix}` : `${twelve}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(start: number, length: number): string {
  return `${formatHour(start)} – ${formatHour(start + length)}`;
}

export const shortDay = (day: number) => DAYS[day].split(' ')[0];

export interface Place {
  /** How far a later overlapping event is inset, so the one under it shows. */
  depth: number;
  /** Events that start within half an hour of each other share the width in lanes. */
  lane: number;
  lanes: number;
}

/** Lays out one day's events: near-simultaneous starts sit side by side, later overlaps cascade. */
export function placeEvents(events: CalEvent[]): Map<string, Place> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.length - a.length);
  const places = new Map<string, Place>();
  const groups = new Map<string, string[]>();
  sorted.forEach((event, i) => {
    const overlapping = sorted.slice(0, i).filter((o) => o.start + o.length > event.start);
    const sibling = overlapping.find((o) => event.start - o.start < 0.5);
    if (sibling) {
      const group = groups.get(sibling.id) ?? [sibling.id];
      const depth = places.get(sibling.id)?.depth ?? 0;
      places.set(event.id, { depth, lane: group.length, lanes: 1 });
      const next = [...group, event.id];
      for (const id of next) groups.set(id, next);
      return;
    }
    const depth = overlapping.reduce((d, o) => Math.max(d, (places.get(o.id)?.depth ?? 0) + 1), 0);
    places.set(event.id, { depth: Math.min(depth, 3), lane: 0, lanes: 1 });
  });
  for (const [id, group] of groups) {
    const place = places.get(id);
    if (place) places.set(id, { ...place, lanes: group.length });
  }
  return places;
}
