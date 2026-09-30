# Pillow

A calm place for people who build on their own, usually with a few AI agents running in the background. It keeps track of what you're building, what's waiting on robots and other people, and where you left off, so you can close the laptop without losing your place.

The design is in [docs/plans/2026-09-30-pillow-organizer-design.md](docs/plans/2026-09-30-pillow-organizer-design.md).

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit and UI tests (Vitest + Testing Library)
npm run typecheck
npm run build      # typecheck, then a production build in dist/
```

## What's in it

- **Today.** What's next from each project, anything due or overdue, everything you're waiting on (and for how long), today's calendar blocks, and a Start the day or Shut down card depending on the time. Tick things off right there. After three hours without a break it says so, once.
- **Projects.** Each project has a **left off at** note, a checklist you can drag into order, a waiting list and a done log. Drag projects to reorder them.
- **Calendar.** A week of time blocks (three days on phones). Drag to create, move and resize; tag a block with a project.
- **Routines.** Named step lists with a streak. A habit is a one-step routine you tick straight from the list. The Shut down routine lists what you shipped today and asks for a fresh "left off at" on each project you touched.
- **Quick capture.** Press `N` anywhere, or the + button on a phone. `#name` files it into a project, a leading `wait` makes it a waiting item, `!today`, `!tomorrow` or `!fri` gives it a due day. Anything unfiled lands in the inbox on Today.
- **Undo** from any toast or with Cmd/Ctrl + Z. Press `?` for shortcuts; `1` to `4` switch tabs.

It follows your system's light or dark mode.

## How it's built

React 19, TypeScript and Vite, with no UI library and one stylesheet.

- `src/domain` holds the model and every rule as plain functions: `capture.ts` reads quick capture lines, `today.ts` decides what Today shows, `routines.ts` handles steps and streaks, `session.ts` the break nudge, `data.ts` every change, and `copy.ts` every line the app says, so the voice lives in one file.
- `src/state` keeps the data with undo history and saves it to `localStorage`.
- `src/dnd/DragProvider.tsx` is the pointer drag engine (mouse, pen and touch), and `src/components/Sortable.tsx` builds reorderable lists on it.
- `src/screens` has the four tabs and the project and routine pages.

## Limits

- Data lives in your browser on one device. No accounts or sync yet.
- No notifications when the app is closed; that needs a server. Due and overdue items show on Today instead.
