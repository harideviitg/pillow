import { addDays, clampStart, dayKey, dayLabel, daysBetween, formatRange, hourOf, weekday, weekStart, type DayKey } from '../lib/time';
import { uid, type Action } from '../store/reducer';
import { itemTitle, toneOfTask } from '../store/select';
import type { Data, Task } from '../store/types';

/** One change the agent makes, with the action that takes it back. */
export interface Step {
  kind: 'task' | 'session' | 'due' | 'done';
  label: string;
  apply: Action;
  revert: Action;
}

export interface Reply {
  text: string;
  steps: Step[];
}

export interface AgentContext {
  data: Data;
  now: number;
}

/**
 * Anything that can answer a message. The offline brain below is rules and
 * regexes; a real model can implement the same shape later.
 */
export interface Brain {
  name: string;
  reply: (input: string, ctx: AgentContext) => Reply | Promise<Reply>;
}

const pick = <T>(options: T[], seed: string) => options[([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0) % options.length];

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DAY_WORDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Finds a day mentioned in text: today, tonight, tomorrow, a weekday, or next week. */
export function parseDay(text: string, today: DayKey): { day: DayKey; match: string } | null {
  const t = text.toLowerCase();
  let m = t.match(/\b(today|tonight)\b/);
  if (m) return { day: today, match: m[0] };
  m = t.match(/\b(tomorrow|tmrw|tmr)\b/);
  if (m) return { day: addDays(today, 1), match: m[0] };
  m = t.match(/\bnext week\b/);
  if (m) return { day: addDays(weekStart(today), 7), match: m[0] };
  m = t.match(/\b(?:on |this |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/);
  if (m) {
    const index = DAY_WORDS.findIndex((d) => d.startsWith(m![1].slice(0, 3)));
    const now = new Date(`${today}T12:00:00`).getDay();
    let ahead = (index - now + 7) % 7;
    if (m[0].startsWith('next ') && ahead === 0) ahead = 7;
    return { day: addDays(today, ahead), match: m[0] };
  }
  return null;
}

/** "at 3pm", "10:30", "at 9" (small hours read as afternoon). */
export function parseTime(text: string): { hour: number; match: string } | null {
  const m = text.toLowerCase().match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (!m) return null;
  let hour = Number(m[1] ?? m[4]);
  const minutes = Number(m[2] ?? m[5] ?? 0);
  const suffix = m[3];
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  if (!suffix && hour < 7) hour += 12;
  if (hour > 23 || minutes > 59) return null;
  return { hour: hour + minutes / 60, match: m[0] };
}

/** "2h", "90 min", "1.5 hours", "half an hour", "an hour". */
export function parseDuration(text: string): { hours: number; match: string } | null {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  if (m) return { hours: Math.min(8, Number(m[1])), match: m[0] };
  m = t.match(/\b(\d+)\s*(m|min|mins|minute|minutes)\b/);
  if (m) return { hours: Math.max(0.25, Math.round((Number(m[1]) / 60) * 4) / 4), match: m[0] };
  m = t.match(/\bhalf an hour\b/);
  if (m) return { hours: 0.5, match: m[0] };
  m = t.match(/\ban hour\b/);
  if (m) return { hours: 1, match: m[0] };
  return null;
}

/** The task a phrase most likely means, preferring open ones. */
export function findTask(query: string, tasks: Task[]): Task | null {
  const q = clean(query);
  if (!q) return null;
  const words = new Set(q.split(' ').filter((w) => w.length > 2));
  let best: { task: Task; score: number } | null = null;
  for (const task of tasks) {
    const t = clean(task.title);
    if (!t) continue;
    let score = 0;
    if (t === q) score = 100;
    else if (t.includes(q) || q.includes(t)) score = 80;
    else {
      const tw = t.split(' ').filter((w) => w.length > 2);
      const shared = tw.filter((w) => words.has(w)).length;
      score = tw.length ? (shared / Math.max(tw.length, words.size)) * 60 : 0;
    }
    if (!task.done) score += 5;
    if (score >= 30 && (!best || score > best.score)) best = { task, score };
  }
  return best?.task ?? null;
}

/** The first gap of `length` hours on a day, from `from` until 9 PM. */
export function freeSlot(data: Data, day: DayKey, length: number, from: number): number | null {
  const busy = data.items.filter((i) => i.day === day).map((i) => [i.start, i.start + i.length] as const);
  for (let start = Math.ceil(from * 4) / 4; start + length <= 21; start += 0.25) {
    if (busy.every(([a, b]) => start + length <= a || start >= b)) return start;
  }
  return null;
}

const stripFiller = (s: string) =>
  s
    .replace(/\b(please|pls|for me|to my list|on my list|to the list|my|the task|task)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:-]+|[\s,.:!?-]+$/g, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function newTask(title: string, due: DayKey | null, now: number): Task {
  return { id: uid('t'), title: capital(title), done: false, projectId: null, due, createdAt: now };
}

function sessionStep(data: Data, task: Task, day: DayKey, start: number, length: number): Step {
  const id = uid('s');
  return {
    kind: 'session',
    label: `${task.title}: ${weekday(day)} ${formatRange(start, length)}`,
    apply: { type: 'addItem', item: { id, kind: 'session', taskId: task.id, projectId: null, title: '', day, start, length, tone: toneOfTask(data, task) } },
    revert: { type: 'removeItem', id },
  };
}

function dueText(day: DayKey, today: DayKey) {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 1 && diff < 7) return `on ${weekday(day, true)}`;
  return `on ${dayLabel(day)}`;
}

const HELP = [
  "Here's what I can do while I'm in offline mode:",
  '• "add call mum" (add "due friday" if it has one)',
  '• "block 2h tomorrow at 10 for the essay"',
  '• "essay due friday"',
  '• "done with the invoice"',
  '• "plan my day", "what\'s due", "what\'s on tomorrow"',
].join('\n');

function reply(input: string, { data, now }: AgentContext): Reply {
  const text = input.trim();
  const lower = text.toLowerCase();
  const today = dayKey(now);
  const open = data.tasks.filter((t) => !t.done);

  if (!text) return { text: 'Say something. I promise not to judge.', steps: [] };

  if (/^(help|\?|what can you do|commands)\b/.test(lower)) return { text: HELP, steps: [] };

  if (/^(hi|hey|hello|yo|sup|hiya|gm|good (morning|afternoon|evening))\b/.test(lower)) {
    const dueToday = open.filter((t) => t.due === today).length;
    const sessions = data.items.filter((i) => i.day === today && i.kind === 'session').length;
    return {
      text: `${pick(['Hey!', 'Oh hi.', 'Hello hello.'], text)} You've got ${open.length} open task${open.length === 1 ? '' : 's'}, ${dueToday} due today and ${sessions} session${sessions === 1 ? '' : 's'} planned. Want me to plan your day?`,
      steps: [],
    };
  }

  if (/\b(thanks|thank you|thx|ty|cheers)\b/.test(lower)) return { text: pick(['Anytime.', 'Of course. Go get it.', 'Happy to help. Now go do the thing.'], text), steps: [] };

  if (/\bplan (my|the|out)? ?(day|today)\b|what should i (do|work on)/.test(lower)) {
    const scheduled = new Set(data.items.filter((i) => i.day === today && i.taskId).map((i) => i.taskId));
    const candidates = open
      .filter((t) => !scheduled.has(t.id))
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
      .slice(0, 3);
    if (candidates.length === 0) return { text: "Nothing open that isn't already planned. Rare. Enjoy it.", steps: [] };
    let from = Math.max(9, Math.ceil(hourOf(now) * 2) / 2);
    const steps: Step[] = [];
    let scratch = data;
    for (const task of candidates) {
      const start = freeSlot(scratch, today, 1, from);
      if (start === null) break;
      const step = sessionStep(data, task, today, start, 1);
      steps.push(step);
      scratch = { ...scratch, items: [...scratch.items, (step.apply as { item: Data['items'][number] }).item] };
      from = start + 1.25;
    }
    if (steps.length === 0) return { text: "Today's full. Maybe tomorrow? Try \"plan tomorrow\" by blocking time: \"block 1h tomorrow for …\".", steps: [] };
    return { text: `Here's a gentle plan. One hour each, with a breather in between:`, steps };
  }

  if (/\b(what('?s| is)|anything|show)\b.*\bdue\b|^deadlines?\b|^due\b/.test(lower)) {
    const end = addDays(today, 7);
    const due = [
      ...open.filter((t) => t.due && t.due <= end).map((t) => ({ title: t.title, due: t.due! })),
      ...data.projects.filter((p) => p.due && p.due <= end).map((p) => ({ title: `${p.name} (project)`, due: p.due! })),
    ].sort((a, b) => a.due.localeCompare(b.due));
    if (due.length === 0) return { text: 'Nothing due this week. Suspiciously calm.', steps: [] };
    const lines = due.map((d) => `• ${d.title}: ${d.due < today ? 'overdue' : dueText(d.due, today)}`);
    return { text: `Due this week:\n${lines.join('\n')}`, steps: [] };
  }

  if (/\b(what('?s| is) on|my day|agenda|schedule for|calendar)\b/.test(lower) && !/\b(block|book|add)\b/.test(lower)) {
    const day = parseDay(text, today)?.day ?? today;
    const items = data.items.filter((i) => i.day === day).sort((a, b) => a.start - b.start);
    const label = day === today ? 'today' : dueText(day, today);
    if (items.length === 0) return { text: `Nothing on ${label}. Wide open.`, steps: [] };
    const lines = items.map((i) => `• ${formatRange(i.start, i.length)}  ${itemTitle(data, i)}${i.kind === 'session' ? ' (session)' : ''}`);
    return { text: `On ${label}:\n${lines.join('\n')}`, steps: [] };
  }

  let m = lower.match(/^(?:i'?m |i am )?(?:done with|finished|completed|did|mark|tick off|tick)\s+(.+?)(?:\s+(?:as )?(?:done|complete|finished))?$/);
  if (m) {
    const task = findTask(stripFiller(m[1]), data.tasks);
    if (!task) return { text: `I couldn't find "${stripFiller(m[1])}" in your tasks. Check the spelling?`, steps: [] };
    if (task.done) return { text: `${task.title} is already ticked off. Overachiever.`, steps: [] };
    return {
      text: pick([`Ticked off ${task.title}. Nice.`, `${task.title}: done. Look at you go.`], task.title),
      steps: [{ kind: 'done', label: task.title, apply: { type: 'updateTask', id: task.id, patch: { done: true } }, revert: { type: 'updateTask', id: task.id, patch: { done: false } } }],
    };
  }

  if (/\b(block|schedule|book|carve out|make time)\b/.test(lower)) {
    const day = parseDay(text, today);
    const time = parseTime(text);
    const length = parseDuration(text)?.hours ?? 1;
    let rest = text;
    for (const part of [day?.match, time?.match, parseDuration(text)?.match]) if (part) rest = rest.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
    const target = stripFiller(rest.replace(/\b(block|schedule|book|carve out|make time|out|some|time|for|to work on|work on|on|at)\b/gi, ' '));
    const when = day?.day ?? today;
    const from = time ? time.hour : when === today ? Math.max(9, Math.ceil(hourOf(now) * 2) / 2) : 9;
    const start = time ? clampStart(time.hour, length) : freeSlot(data, when, length, from);
    if (start === null) return { text: `${capital(dueText(when, today))} is packed. Give me a time, like "at 4pm".`, steps: [] };
    const existing = target ? findTask(target, data.tasks) : null;
    const steps: Step[] = [];
    let task = existing;
    if (!task) {
      task = newTask(target || 'Focus time', null, now);
      steps.push({ kind: 'task', label: task.title, apply: { type: 'addTask', task, at: 0 }, revert: { type: 'removeTask', id: task.id } });
    }
    steps.push(sessionStep(data, task, when, start, length));
    return { text: pick([`Blocked. Protect that time.`, `Done. That time is yours now.`, `On the calendar. Future you says thanks.`], task.title), steps };
  }

  m = text.match(/^(.+?)\s+(?:is\s+)?due\s+(.+)$/i) ?? text.match(/^(?:set\s+)?(?:a\s+)?deadline\s+(?:for\s+)?(.+?)\s+(?:on|to|for)\s+(.+)$/i);
  if (m) {
    const day = parseDay(m[2], today);
    if (!day) return { text: `When's it due? Try "${stripFiller(m[1])} due friday".`, steps: [] };
    const title = stripFiller(m[1].replace(/^(add|new|set)\s+/i, ''));
    const task = findTask(title, data.tasks);
    if (task) {
      return {
        text: `${task.title} is due ${dueText(day.day, today)}. It's on the Due strip.`,
        steps: [{ kind: 'due', label: `${task.title}: ${dayLabel(day.day)}`, apply: { type: 'setDue', ref: { kind: 'task', id: task.id }, due: day.day }, revert: { type: 'setDue', ref: { kind: 'task', id: task.id }, due: task.due } }],
      };
    }
    const created = newTask(title, day.day, now);
    return {
      text: `New one: ${created.title}, due ${dueText(day.day, today)}.`,
      steps: [{ kind: 'task', label: `${created.title} (due ${dayLabel(day.day)})`, apply: { type: 'addTask', task: created, at: 0 }, revert: { type: 'removeTask', id: created.id } }],
    };
  }

  m = text.match(/^(?:add|new task|new|todo|to do|create|remind me to|i need to|i have to|i gotta|gotta|need to)\s*:?\s+(.+)$/i);
  if (m) {
    const day = parseDay(m[1], today);
    const title = stripFiller(day ? m[1].replace(new RegExp(`\\b(by|before|on|due)?\\s*${day.match}`, 'i'), ' ') : m[1]);
    if (!title) return { text: 'Add what, exactly?', steps: [] };
    const task = newTask(title, day?.day ?? null, now);
    return {
      text: day ? `Added ${task.title}, due ${dueText(day.day, today)}.` : pick([`Added ${task.title}. Want me to find it a slot?`, `${task.title} is on the list.`], task.title),
      steps: [{ kind: 'task', label: day ? `${task.title} (due ${dayLabel(day.day)})` : task.title, apply: { type: 'addTask', task, at: 0 }, revert: { type: 'removeTask', id: task.id } }],
    };
  }

  return {
    text: `I'm in offline mode, so I only catch the basics for now.\n${HELP.split('\n').slice(1).join('\n')}`,
    steps: [],
  };
}

export const offlineBrain: Brain = { name: 'Pip (offline mode)', reply };
