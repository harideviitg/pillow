import { addDays, dayKey, startOfDay } from './dates';
import type { DayKey, Project } from './types';

export interface Capture {
  kind: 'task' | 'wait';
  text: string;
  projectId: string | null;
  due: DayKey | null;
  /** A #tag that matched no project; the item goes to the inbox with the tag left in. */
  unknownTag: string | null;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Finds a project by #tag: an exact match first, then the start of a name, then anywhere in it. */
export function matchProject(tag: string, projects: Project[]): Project | null {
  const t = slug(tag);
  if (!t) return null;
  const open = projects.filter((p) => !p.archived);
  return (
    open.find((p) => slug(p.name) === t) ??
    open.find((p) => slug(p.name).startsWith(t)) ??
    open.find((p) => slug(p.name).includes(t)) ??
    null
  );
}

const WAIT_PREFIX = /^\s*wait(?:ing)?(?:\s+(?:on|for))?\s*[:\s]\s*/i;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function dueFromWord(word: string, now: number): DayKey | null {
  const w = word.toLowerCase();
  const today = startOfDay(now);
  if (w === 'today') return dayKey(today);
  if (w === 'tomorrow' || w === 'tmrw' || w === 'tom') return dayKey(addDays(today, 1));
  // "fri", "frid" and "friday" all work; "monkey" doesn't.
  const index = w.length >= 3 ? DAY_NAMES.findIndex((d) => d.startsWith(w)) : -1;
  if (index < 0) return null;
  const ahead = (index - new Date(today).getDay() + 7) % 7;
  return dayKey(addDays(today, ahead));
}

/**
 * Reads a quick capture line.
 * `#name` files it into a project, a leading `wait` makes it a waiting item,
 * and `!today`, `!tomorrow` or `!fri` gives a task a due day.
 */
export function parseCapture(input: string, projects: Project[], now: number): Capture | null {
  let text = input;
  let kind: Capture['kind'] = 'task';
  if (WAIT_PREFIX.test(text)) {
    kind = 'wait';
    text = text.replace(WAIT_PREFIX, '');
  }

  let projectId: string | null = null;
  let unknownTag: string | null = null;
  text = text.replace(/(^|\s)#([\w-]+)/g, (whole, lead: string, tag: string) => {
    if (projectId) return whole;
    const project = matchProject(tag, projects);
    if (!project) {
      unknownTag ??= tag;
      return whole;
    }
    projectId = project.id;
    return lead;
  });

  let due: DayKey | null = null;
  text = text.replace(/(^|\s)!([a-z]+)/gi, (whole, lead: string, word: string) => {
    const day = dueFromWord(word, now);
    if (!day) return whole;
    due ??= day;
    return lead;
  });

  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return { kind, text, projectId, due: kind === 'task' ? due : null, unknownTag };
}
