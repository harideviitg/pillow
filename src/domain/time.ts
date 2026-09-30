import type { Round } from './types';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** Hours left before a live round closes; negative once overdue, null without a deadline. */
export function hoursUntilDue(round: Round, now: number): number | null {
  if (round.closesAfterHours === null || round.startedAt === null) return null;
  return (round.startedAt + round.closesAfterHours * HOUR - now) / HOUR;
}

function spanLabel(hours: number): string {
  const h = Math.max(1, Math.round(hours));
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function dueLabel(round: Round, now: number): string | null {
  const hours = hoursUntilDue(round, now);
  if (hours === null) return null;
  return hours >= 0 ? `Due in ${spanLabel(hours)}` : `Overdue ${spanLabel(-hours)}`;
}

export function closesLabel(round: Round, now: number): string | null {
  const hours = hoursUntilDue(round, now);
  if (hours === null) return null;
  return hours >= 0 ? `Closes in ${spanLabel(hours)}` : `Closed ${spanLabel(-hours)} ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 60 * 1000) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return shortDate(ts);
}
