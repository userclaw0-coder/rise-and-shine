# Rise-and-Shine Cursor Packet 04 — Queue Behavior + Next Action Clarity

## Header
- Packet name: Queue behavior and next action clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/queue-behavior-next-action-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-queue-behavior-next-action-clarity

## Objective
Add a narrow clarity layer on the Today experience so users better understand how the stable Next-3 queue behaves and what action will move them forward right now.

## Why this matters
The approved product priorities explicitly call for making queue behavior clear in UI microcopy. After rationale, subtask trust, and progress-to-outcome visibility are in place, the next useful trust-building slice is removing ambiguity around why the queue stays stable and what the user should do next.

## Scope
In scope:
- add concise UI copy or a compact helper surface on Today that explains stable queue behavior
- reinforce what happens when tasks are completed, refreshed, or waiting on subtasks/backlog
- make the current next action feel clearer without redesigning the page
- keep the change user-facing, narrow, and reviewable

## Non-goals
Not in scope:
- planner architecture rewrite
- onboarding redesign
- analytics expansion
- auth changes
- deployment verification

## Likely files / surfaces
- `pages/today.js`
- `components/SectionCard.js`
- `components/ProgressToOutcome.js` (only if a small integration touch helps)
- any very small helper for display text/state mapping

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Today clearly explains stable Next-3 queue behavior in one user-visible place.
- [ ] Users can tell what action should happen next when a task is completed or when subtasks/backlog are involved.
- [ ] The implementation remains narrow and trustworthy.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

## Verification
Run and report exactly:

```bash
npm run lint
npm run build
```

## Implementation notes
- Prefer plain-language trust-building copy over cleverness.
- Keep it useful for first-week users.
- Avoid turning this into a tutorial system.

## Definition of done
Done means:
- code is committed on `feat/queue-behavior-next-action-clarity`
- verification passes
- Today makes queue behavior and the next meaningful action clearer
- completion report includes branch, commit, summary, verification, and risks
