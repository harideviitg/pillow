/**
 * Every line Pillow says lives here, so the voice can be tuned in one place.
 * Lines are picked with a seed (usually the day) so they don't reshuffle on
 * every render.
 */
import { formatDuration, formatTime, weekdayName } from './dates';

export function pick<T>(options: readonly T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return options[Math.abs(h) % options.length];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface DayState {
  waiting: number;
  overdue: number;
  next: number;
  shipped: number;
}

export function greeting(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 4) return "It's late.";
  if (hour < 12) return 'Morning.';
  if (hour < 17) return 'Afternoon.';
  return 'Evening.';
}

export function daySummary(now: number, s: DayState, seed: string): string {
  const hour = new Date(now).getHours();
  if (hour < 4) {
    return pick(
      [
        `${formatTime(now)}. The bug will still be there after you sleep.`,
        `${formatTime(now)}. Nothing good gets merged at this hour.`,
        `${formatTime(now)}. Save, commit, sleep.`,
      ],
      seed,
    );
  }
  if (s.overdue > 0) {
    return pick([`${plural(s.overdue, 'thing')} overdue. They won't do themselves.`, `${plural(s.overdue, 'thing')} overdue. Start there.`], seed);
  }
  if (s.shipped >= 5) return pick([`${s.shipped} things shipped already. Show-off.`, `${s.shipped} done today. Save some for tomorrow.`], seed);
  if (s.waiting > 0) {
    return pick(
      [
        `${weekdayName(now, true)}. ${plural(s.waiting, 'thing')} waiting on robots and other people.`,
        `${plural(s.waiting, 'thing')} in flight. Do something else while they cook.`,
      ],
      seed,
    );
  }
  if (s.next === 0) return pick(['Clean slate. Suspicious.', 'Nothing queued. Enjoy it or add something.'], seed);
  return pick([`${weekdayName(now, true)}. Pick one thing and finish it.`, `${plural(s.next, 'thing')} up next. One at a time.`], seed);
}

export function inboxLine(n: number): string {
  if (n === 1) return '1 loose idea. File it before it multiplies.';
  return `${n} loose ideas. Sort them or they'll haunt you.`;
}

export function breakLine(worked: number, seed: string): string {
  const d = formatDuration(worked);
  return pick(
    [`${d} straight. Stretch. The agent can wait.`, `${d} in. Water, then back to it.`, `${d} without a break. Your spine has notes.`],
    seed,
  );
}

export function signOff(seed: string): string {
  return pick(
    [
      'Logged off. The agents can babysit themselves.',
      'Done for today. Future you says thanks.',
      "That's a wrap. Don't open the laptop again. We'll know.",
      'Shut down complete. Go touch grass.',
    ],
    seed,
  );
}

export function startLine(seed: string): string {
  return pick(['Set. Go make something.', 'Day started. Close the other tabs.', 'Ready. One thing at a time.'], seed);
}

export function waitingHint(ms: number): string | null {
  if (ms > 2 * 24 * 60 * 60 * 1000) return 'Maybe chase this one.';
  return null;
}

export const EMPTY = {
  next: 'Nothing up next. Add a task or enjoy the silence.',
  projects: 'Nothing on the go. Suspiciously calm.',
  checklist: "No tasks. Either you're done or you haven't started.",
  waiting: 'Nothing in flight.',
  routines: 'No routines yet. Even chaos has a rhythm.',
  steps: 'No steps yet. Add the first one.',
  shipped: 'Nothing ticked off today. Tomorrow exists.',
  calendarHint: 'Drag on the grid to block out time.',
} as const;
