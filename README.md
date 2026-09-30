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

- **Flow canvas.** Trigger, rounds, final say gates with Approved and Changes branches, lock steps, and the revise and resend loop, laid out the way the design shows them. Pan by dragging or scrolling, zoom with the controls or ctrl/cmd + scroll, fit to screen, and jump around with the minimap.
- **Blocks panel.** Drag a round onto a `+` point to insert it, or drag a rule or nudge onto a round. Clicking a block does the same for the selected round, so it also works from the keyboard.
- **Inspector.** For the selected round: what reviewers can comment on (in focus, parked for a later round, locked, or reopened), reviewers and who has the final say, deadline and nudges, and revision rounds with an optional paid extra round. Final say, lock and revision nodes have their own panels.
- **Running the flow.** Record approval (locks the round's layers and makes the next round live), request changes (uses a revision), buy the extra round, nudge a reviewer, and start the next round from the trigger.
- **Preview as reviewer.** Comment as any reviewer and see where the comment lands: counted now, parked, or sent as a reopen request.
- **All comments and Activity.** Every comment grouped by where it was routed, with accept or decline for reopen requests, plus a log of what happened.
- **Check for gaps.** Aspects nobody reviews, rounds without reviewers, final say or deadline, overdue rounds, and feedback with nowhere to go.
- **Projects.** A project list, new projects from a four round template, and a sample project matching the design.

## How it is built

React 19, TypeScript and Vite, with no UI library. Styling is one stylesheet using the design's tokens (Geist and Geist Mono, the same greys, greens, blues and oranges).

- `src/domain` holds the model and all the rules as plain functions: `routing.ts` works out each aspect's status per round and where each comment goes, `layout.ts` turns a project into canvas coordinates, `reducer.ts` holds every change, and `gaps.ts` holds the checks. Nothing in it touches React.
- `src/state/store.tsx` keeps the app state and saves it to `localStorage`.
- `src/components` holds the screens.

## Limits of this version

- Everything is stored in the browser. There is no server or sign in yet, so a shared round link only opens in the browser that made it.
- Nudges are recorded in the activity log but nothing is actually sent by email or WhatsApp.
- Uploading a version is simulated by the trigger's start button; there is no file upload.
