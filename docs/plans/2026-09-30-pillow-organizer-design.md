# Pillow: a personal organizer for solo builders

## Who it is for

People who build on their own with AI agents: several side projects at once,
agents and deploys running in the background, and no natural stopping point.
It is not a collaboration tool.

## The four pains it solves

1. Losing their place when they jump between projects.
2. Babysitting agents, deploys and reviews by tab hopping.
3. Ideas that show up mid-flow and derail the current task.
4. Never stopping, so nothing ever feels done.

Anything that does not serve one of these is out, including money tracking.

## Screens

Four tabs: Today, Projects, Calendar, Routines. Bottom tabs on phones, top
tabs on desktop. One narrow column, lots of space. Empty sections hide.

- **Today**: one greeting line in the app's voice; an inbox of unfiled
  captures when there are any; Next up (the next one or two open items per
  active project, plus anything due today or overdue); Waiting on (every
  waiting item with how long it has waited); a thin strip of today's blocks;
  a routine card (Start the day in the morning, Shut down in the evening);
  a quiet break nudge after three hours of continuous activity.
- **Projects**: list rows show name, the "left off at" line and a done count.
  A project page shows the editable "left off at" note, the checklist (drag
  to reorder), the waiting list and a small done log.
- **Calendar**: week view (three days on phones). Drag to create, move and
  resize blocks. A block can be tagged with a project.
- **Routines**: named step lists. Run mode taps through the steps. A streak
  counts consecutive days completed. A habit is a one-step routine.

## Quick capture

`n` anywhere, or + on phones. `#name` files the item into the matching
project, a leading `wait` makes it a waiting item, anything unfiled goes to
the inbox.

## Shutdown ritual

Lists what was ticked off today, asks for a fresh "left off at" note on each
project touched today, and signs off with a line in the app's voice.

## Personality

All copy the app speaks lives in one file, chosen by time of day and state.
Short, dry lines. No mascot, confetti or badges.

## Build

- Same React, TypeScript and Vite stack and the same Vercel deploy.
- Remove the design review code: flow canvas, rounds, aspects, reviewer page,
  comments, blocks panel, inspector.
- Keep and trim: the pointer drag engine, the calendar week grid, undo and
  redo, toasts, hotkeys, icons, design tokens.
- Data is saved in the browser under a new key. Old review data is ignored.
  First run seeds one example project and the two starter routines.
- No accounts, sync or push notifications in this version; they need a
  backend.

## Data model

- Project: id, name, leftOffAt, items (text, done, doneAt, due), waiting
  (text, since, doneAt), archived.
- Inbox item: id, text, createdAt.
- Block: id, title, start, end, projectId.
- Routine: id, name, steps, completions (local dates).

## Testing

Unit tests for the capture parser, Today selection, streaks, the shutdown
summary and the break nudge; a render test per tab; a browser pass on desktop
and phone before pushing.
