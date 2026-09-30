import { HOUR, MINUTE } from './dates';

/** A stretch of continuous work: it starts on the first action after a real gap. */
export interface Session {
  start: number;
  last: number;
  snoozeUntil: number;
}

/** A gap this long counts as a break and starts a new session. */
export const IDLE_GAP = 20 * MINUTE;
export const BREAK_AFTER = 3 * HOUR;
export const SNOOZE = 45 * MINUTE;

export function touch(session: Session | null, now: number): Session {
  if (!session || now - session.last > IDLE_GAP) return { start: now, last: now, snoozeUntil: session?.snoozeUntil ?? 0 };
  return { ...session, last: now };
}

export function breakDue(session: Session | null, now: number): boolean {
  if (!session || now - session.last > IDLE_GAP) return false;
  return now - session.start >= BREAK_AFTER && now >= session.snoozeUntil;
}

export function snooze(session: Session, now: number): Session {
  return { ...session, snoozeUntil: now + SNOOZE };
}
