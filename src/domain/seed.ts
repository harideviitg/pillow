import { addDays, atMinutes, dayKey, HOUR, MINUTE, startOfDay } from './dates';
import { routineDay } from './routines';
import type { Data, Routine } from './types';

export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function routine(id: string, name: string, kind: Routine['kind'], steps: string[], completions: string[] = []): Routine {
  return {
    id,
    name,
    kind,
    steps: steps.map((text, i) => ({ id: `${id}-${i}`, text })),
    progress: { day: '', done: [] },
    completions,
  };
}

/** First-run data: one example project and the starter routines, all deletable. */
export function seedData(now: number): Data {
  const today = startOfDay(now);
  const at = (days: number, hour: number, minute = 0) => atMinutes(addDays(today, days), hour * 60 + minute);
  const daysAgo = (n: number) => routineDay(now - n * 24 * HOUR);
  return {
    version: 1,
    projects: [
      {
        id: 'p-portfolio',
        name: 'Portfolio site',
        leftOffAt: 'Hero section is done. Next is the case study page; the draft copy is in notes.md.',
        leftOffAtUpdated: now - 20 * HOUR,
        archived: false,
        createdAt: now - 6 * 24 * HOUR,
      },
    ],
    tasks: [
      { id: 't-font', text: 'Pick a font', projectId: 'p-portfolio', done: true, doneAt: now - 22 * HOUR, due: null, createdAt: now - 5 * 24 * HOUR },
      { id: 't-case', text: 'Write the case study copy', projectId: 'p-portfolio', done: false, doneAt: null, due: dayKey(now), createdAt: now - 3 * 24 * HOUR },
      { id: 't-shots', text: 'Export screenshots at 2x', projectId: 'p-portfolio', done: false, doneAt: null, due: null, createdAt: now - 3 * 24 * HOUR },
      { id: 't-domain', text: 'Point the domain at Vercel', projectId: 'p-portfolio', done: false, doneAt: null, due: null, createdAt: now - 2 * 24 * HOUR },
      { id: 't-og', text: 'Make an OG image', projectId: 'p-portfolio', done: false, doneAt: null, due: null, createdAt: now - 2 * 24 * HOUR },
      { id: 't-idea', text: 'Try building a tiny CLI for this', projectId: null, done: false, doneAt: null, due: null, createdAt: now - 3 * HOUR },
    ],
    waits: [
      { id: 'w-agent', text: 'Agent refactoring the nav component', projectId: 'p-portfolio', since: now - 40 * MINUTE, doneAt: null },
      { id: 'w-review', text: 'Feedback from Sam on the hero', projectId: 'p-portfolio', since: now - 26 * HOUR, doneAt: null },
    ],
    blocks: [
      { id: 'b-deep', title: 'Deep work: case study', start: at(0, 10), end: at(0, 12), projectId: 'p-portfolio' },
      { id: 'b-gym', title: 'Gym', start: at(0, 18), end: at(0, 19), projectId: null },
      { id: 'b-ship', title: 'Ship the portfolio', start: at(1, 14), end: at(1, 16), projectId: 'p-portfolio' },
    ],
    routines: [
      routine('r-start', 'Start the day', 'start', ["Check what's waiting", 'Pick the one thing that matters today', 'Close Twitter'], [daysAgo(1), daysAgo(2)]),
      routine('r-shutdown', 'Shut down', 'shutdown', ["Queue tomorrow's first task", 'Close every tab you opened today', 'Close the laptop'], [daysAgo(1)]),
      routine('r-walk', 'Walk outside', 'custom', ['Walk outside'], [daysAgo(1), daysAgo(2), daysAgo(3)]),
    ],
  };
}
