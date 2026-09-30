# Lockstep

A review flow builder for design studios. You lay out a client project as rounds (Direction, Layout, Copy, Polish), and each round says what reviewers can comment on right now. Feedback on anything else is parked for the round where it belongs, and feedback on something already locked becomes a reopen request instead of quietly undoing a decision.

This is a build of the "Review flow builder" design from the Lockstep canvas.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit and UI tests (Vitest + Testing Library)
npm run typecheck
npm run build      # typecheck, then a production build in dist/
```

## What works

### Flow

- **Everything drags.** Pull a round from the blocks panel into the flow and the rounds below slide apart to open a gap where it will land. Pick up an upcoming round and drag it to a new position, or drop it on the remove zone that appears at the bottom. Drop rules and nudges on a round, drop a person on a round to add them as a reviewer or on its final say to hand them the decision, and drag an aspect from the inspector onto the round that should review it. Rounds that already ran shake and stay put.
- **Smooth canvas.** Every change animates: nodes and connectors glide to their new places, new ones fade in, removed ones fade out. Panning has momentum, zoom eases, and trackpad pinch, ctrl/cmd + scroll and two finger pinch on touch screens all zoom around where you point. Dragging near an edge pans the canvas for you.
- **Touch.** Hold a finger on anything to pick it up; a quick swipe still pans or scrolls.
- **Undo everything.** Every change can be undone from the toast that confirms it, the header buttons, or Cmd/Ctrl + Z (Shift to redo).
- **Inspector, reviewer preview, comments, activity and gap checks** work as before. Each round now also lists its meetings and can schedule a review call.

### Calendar

- **Day, week and month views**, with three days at a time on phones. A red line marks now, and the clock in the corner ticks every second.
- **Drag to book.** Drag down an empty stretch of the grid to create a meeting, drag a meeting to move it (across days too), drag its bottom edge to change its length, and in month view drag a meeting to another day. Everything snaps to 15 minutes and auto scrolls near the edges.
- **Review deadlines live on the calendar.** The live round's review window sits in the all day lane and its deadline is a marker you can drag to move the deadline itself.
- **People.** Drag someone onto a meeting to invite them, or onto an empty slot to book time with them. The meeting panel shows each person's local time and warns when a meeting falls outside their working hours. A second time zone can run down the side of the grid.
- **Up next** counts down to your next meetings and deadlines to the second.

### Shortcuts

Press `?` for the full list. The main ones: `1` and `2` switch between Flow and Calendar, `N` new meeting, `T` today, arrow keys page through the calendar, `D` `W` `M` change the view, `+` `-` `0` `F` zoom the flow, Alt + arrows move the selected round or meeting, Delete removes it, Esc cancels a drag.

## How it is built

React 19, TypeScript and Vite, with no UI library. Styling is one stylesheet using the design's tokens (Geist and Geist Mono, the same greys, greens, blues and oranges).

- `src/domain` holds the model and all the rules as plain functions: `routing.ts` works out each aspect's status per round and where each comment goes, `layout.ts` turns a project into canvas coordinates, `reducer.ts` holds every change, `gaps.ts` holds the checks and `calendar.ts` the date maths and meeting layout. Nothing in it touches React.
- `src/dnd/DragProvider.tsx` is the drag engine: pointer events for mouse, pen and touch, a ghost that eases after the pointer and tilts with it, drop targets found by hit testing, and landing and snap back animations.
- `src/motion` tweens the canvas from one layout to the next.
- `src/state/store.tsx` keeps the app state with undo history and saves it to `localStorage`.
- `src/components` holds the screens, with the calendar under `src/components/calendar`.

## Limits of this version

- Everything is stored in the browser. There is no server or sign in yet, so a shared round link only opens in the browser that made it.
- Nudges are recorded in the activity log but nothing is actually sent by email or WhatsApp, and meetings are not synced to Google Calendar or Outlook.
- Uploading a version is simulated by the trigger's start button; there is no file upload.
