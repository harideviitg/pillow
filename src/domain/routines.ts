import { addDays, dayKey, HOUR, startOfDay } from './dates';
import type { DayKey, Routine } from './types';

/** Routine days roll over at 4 AM, so a 1 AM shutdown still belongs to the evening before. */
export const ROLLOVER_HOURS = 4;

export function routineDay(now: number): DayKey {
  return dayKey(now - ROLLOVER_HOURS * HOUR);
}

/** Step ids ticked today; yesterday's ticks don't carry over. */
export function doneSteps(routine: Routine, today: DayKey): string[] {
  return routine.progress.day === today ? routine.progress.done : [];
}

export function isDoneOn(routine: Routine, day: DayKey): boolean {
  return routine.completions.includes(day);
}

/** Ticks or unticks a step, and records the day as complete once every step is ticked. */
export function toggleStep(routine: Routine, stepId: string, today: DayKey): Routine {
  const current = doneSteps(routine, today);
  const done = current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId];
  return withProgress(routine, done, today);
}

/** Ticks every step at once, for one-step habits and "done, all of it". */
export function completeAll(routine: Routine, today: DayKey): Routine {
  return withProgress(routine, routine.steps.map((s) => s.id), today);
}

function withProgress(routine: Routine, done: string[], today: DayKey): Routine {
  const complete = routine.steps.length > 0 && routine.steps.every((s) => done.includes(s.id));
  const others = routine.completions.filter((d) => d !== today);
  return { ...routine, progress: { day: today, done }, completions: complete ? [...others, today].sort() : others };
}

/**
 * Days in a row the routine was completed. Today not being done yet
 * doesn't break the streak; the day isn't over.
 */
export function streak(routine: Routine, now: number): number {
  const days = new Set(routine.completions);
  let cursor = startOfDay(now - ROLLOVER_HOURS * HOUR);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** The last seven days, oldest first, for a row of dots. */
export function lastWeek(routine: Routine, now: number): { day: DayKey; done: boolean }[] {
  const days = new Set(routine.completions);
  return Array.from({ length: 7 }, (_, i) => {
    const day = dayKey(addDays(startOfDay(now - ROLLOVER_HOURS * HOUR), i - 6));
    return { day, done: days.has(day) };
  });
}
