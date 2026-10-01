# Pillow

A calendar and task prototype: a week from 8 AM to 6 PM next to a task list, built as a close copy of the live "Try it" prototype on the time.fyi landing page. It's the starting point; features get added or removed from here.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest + Testing Library
npm run build      # typecheck, then a production build in dist/
```

## What you can do

- **Drag on the grid** to make an event, then type its name. A click makes a one hour event.
- **Drag an event** to move it, across days too. It lifts, tilts and lands back into its slot. Drag its bottom edge to resize.
- **Click an event** for its details: change its colour or delete it. Delete or Backspace also removes it, Escape closes.
- **Drag an event onto the task list** to turn it back into a task, or **drag a task onto the grid** to block time for it.
- **Tick tasks** and **add new ones** under Today.
- **One-off scheduling** (link icon): paint the hours you're free, move and resize them, then copy the link. Tab, the arrow keys, Shift + arrows, Backspace and Cmd/Ctrl + C work while it's open.
- **Booking page** (calendar icon) shows the booking types.
- **Today** pulses the now line, **Week / Day** switches the view, and **Reset** puts everything back.

Nothing is saved yet; a reload starts fresh.

## Code

- `src/prototype/model.ts`: the sample week, colours, time helpers and how overlapping events are laid out.
- `src/prototype/Prototype.tsx`: the app and all its gestures.
- `src/prototype/parts.tsx`: event chips, the details popover and the side panels.
- `src/styles.css`: every style, with the same sizes, colours and timings as the reference.
