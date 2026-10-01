# Pillow

A calm personal planner: your tasks, your week, a canvas for mapping things out, and an agent that helps. Built on the look of the time.fyi landing page prototype, with its own small design system.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest + Testing Library
npm run build      # typecheck, then a production build in dist/
```

## Sections

**Plan.** Your tasks on the left, your week on the right.
- Drag a task (or a whole project) onto the grid to make a **session**: time set aside to work on it. It shows a small tick, and ticking the task off fades it.
- Drop it on a day's **Due** strip to give it a **deadline**. Drag flags between days, or back to the tray to clear them.
- Drag on empty grid to add an event (gym, a call). Drag blocks to move them, pull the bottom edge to resize, click one for its colour, done and delete.
- Drag a session back into the tray to unschedule it; an event dropped there becomes a task.
- Week or day view, arrows or ← → to move, T for today.

**Flows.** A canvas for working out what leads to what.
- Drag tasks in from the tray, or double-click the canvas to jot a new one.
- Pull the dot on a card's edge to another card to draw an arrow.
- Drag a box around cards (or shift-click them), then **Group into project** (⌘G / Ctrl+G). The project gets a frame with its name, shows up in the sidebar and the tray, and can be dropped on the calendar like any task.
- Scroll to pan, Ctrl/Cmd + scroll or pinch to zoom, Delete takes cards off the canvas.

**Pip.** Your agent. It's in offline mode: simple rules for now, with the same interface a real model will plug into later. It understands things like:
- "add call mum due friday"
- "block 2h tomorrow at 10 for the essay"
- "essay due monday", "done with the invoice"
- "plan my day", "what's due this week", "what's on tomorrow"

Everything Pip changes shows up as a card with Undo.

Undo and redo work everywhere with Cmd/Ctrl + Z (Shift to redo). Data is saved in your browser.

## Code

- `src/store`: the data model (tasks, projects, calendar items, canvas cards and arrows), every change as a reducer action, undo history and saving.
- `src/plan`: the Plan page and the week grid.
- `src/flows`: the canvas.
- `src/agent`: the chat page and `brain.ts`, the offline brain behind a `Brain` interface.
- `src/ui`: the sidebar, the shared task tray, dragging out of the tray, icons and toasts.
- `src/styles.css`: the design tokens at the top, then each section.
