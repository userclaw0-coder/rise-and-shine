# Rise-and-Shine Cursor Packet 01 — Why-this-task-now + Subtask Orchestration Slice

## Header
- Packet name: Rationale quality + approved subtask orchestration
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/rationale-subtask-flow
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-rationale-subtask-flow

## Objective
Implement one narrow, user-visible slice that strengthens the "why this task now" rationale and introduces the approved subtask orchestration flow: generate -> edit/approve -> best subtask to Next-3 -> remaining approved subtasks to backlog.

## Why this matters
Rise-and-Shine is already operationally usable. The next valuable step is improving user trust in prioritization and turning large tasks into actionable subtasks without breaking the stabilized planner/apply flow.

## Scope
In scope:
- improve or add visible rationale copy/UI for why a selected task is prioritized now
- implement a narrow subtask orchestration flow for one task surface
- allow generated subtasks to be reviewed/edited/approved before apply
- send the best approved subtask to the active execution list / Next-3 path
- route remaining approved subtasks to backlog
- keep the slice reviewable and local-first

## Non-goals
Not in scope:
- broad onboarding changes
- auth rewrites
- planner architecture rewrites
- large refactors outside the touched flow
- deployment or production verification
- routine work on main

## Likely files / surfaces
- pages/today.js
- pages/backlog.js
- components/* related to task detail or planner UX
- lib/today-queue.js
- lib/planner-* or related orchestration helpers
- any small helper or style adjustments required for this slice

## Repo boundary reminders
- Start from `develop` and keep routine work off `main`.
- Preserve the stabilized planner/apply flow; do not regress auth/error handling.
- Keep validation local-first.

## Acceptance criteria
- [ ] A user can see clearer "why this task now" rationale on the touched surface.
- [ ] A narrow subtask generation/review/approval flow exists for the chosen task surface.
- [ ] The flow sends one best approved subtask to the active execution path / Next-3.
- [ ] Remaining approved subtasks are routed to backlog.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

## Verification
Run and report exactly:

```bash
npm run lint
npm run build
```

Add targeted local checks if needed, but do not skip the commands above.

## Implementation notes
- Keep the slice narrow and trustworthy.
- Favor explicit UI/state handling over cleverness.
- Preserve current stabilized behavior unless directly improving this packet’s scope.
- If there is ambiguity about exact UI placement, choose the smallest coherent surface and state the choice clearly.

## Definition of done
Done means:
- code is committed on `feat/rationale-subtask-flow`
- acceptance criteria are satisfied
- required verification is run
- a completion report is returned with branch, commit, summary, verification, and risks

## Rollback / risk notes
This should remain a reversible vertical slice. Avoid hidden coupling that would force a wider planner rewrite.
