# Pillow app: plan, flows and agent

Built on the look of the time.fyi prototype copy, turned into a full screen
personal app with its own small design system.

## Shell

Left sidebar: Plan, Flows, Agent, then the project list. No demo chrome.
On phones the sidebar becomes a bottom bar and the task tray opens as an
overlay.

## Plan

- Task tray: loose tasks, then projects that expand to their tasks. Add,
  tick, rename, delete.
- Week calendar (or one day) with real dates, now line, previous and next.
- Drop a task or project on the grid: a session (work block, shows a tick).
- Drop it on the Due strip under a day: a deadline flag. Drag flags between
  days, or back to the tray to clear.
- Drag on empty grid: a plain event. Drag a session back to the tray to
  unschedule it; an event dropped there becomes a task.

## Flows

- Canvas with a dot background and the same tray. Drag tasks in; double
  click to make a card; drag from a card's handle to another to draw an
  arrow.
- Marquee or shift-click to select, then Group into project: a tinted frame
  with the project name. The project appears in the tray and sidebar and can
  be dropped on the calendar like a task.
- Wheel pans, Ctrl/Cmd + wheel zooms.

## Agent

"Pip", offline mode for now: a rule-based brain behind an interface a real
model can replace. It adds tasks, blocks sessions, sets deadlines, marks
tasks done, plans the day into free slots and answers what is due or on
today. Every change shows as a card with Undo.

## Data

Saved in the browser. Undo and redo for all edits (not chat or canvas view).
