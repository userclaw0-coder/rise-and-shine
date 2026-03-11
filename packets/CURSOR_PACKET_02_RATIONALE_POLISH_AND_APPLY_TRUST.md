# Rise-and-Shine Cursor Packet 02 — Rationale Polish + Apply-Path Trust Hardening

## Header
- Packet name: Rationale polish and orchestration trust hardening
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/rationale-polish-apply-trust
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-rationale-polish-apply-trust

## Objective
Tighten the newly added why-this-task-now and subtask orchestration flow so it feels trustworthy and coherent in real use, with special attention to apply-path clarity, message quality, and edge-case handling.

## Why this matters
The first Cursor slice landed successfully on `develop`, but the next value is making the experience feel dependable rather than merely present. This is the step from “feature exists” to “feature earns trust.”

## Scope
In scope:
- polish the rationale presentation so it reads clearly and consistently
- harden the orchestration apply path for obvious UX edge cases
- improve user-facing success/error states around subtask apply
- ensure the queue/backlog transition remains understandable after apply
- keep the slice narrow and local-first

## Non-goals
Not in scope:
- auth redesign
- planner architecture rewrite
- broad onboarding work
- production deploy checks
- unrelated refactors

## Likely files / surfaces
- `pages/today.js`
- `components/SubtaskOrchestrator.js`
- `lib/today-queue.js`
- `lib/scoring.js`
- any small helper or style adjustments directly required by the flow

## Repo boundary reminders
- Routine work stays off `main`.
- Preserve the stabilized planner/apply/auth foundation.
- Keep validation local-first.

## Acceptance criteria
- [ ] Why-this-task-now rationale reads clearly and consistently for typical queue items.
- [ ] Subtask orchestration apply flow has better user-facing trust signals (clear success/error/empty states).
- [ ] Queue/backlog outcomes after apply are understandable in the touched UI.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

## Verification
Run and report exactly:

```bash
npm run lint
npm run build
```

## Implementation notes
- Prefer sharp UX improvements over new feature spread.
- Choose the smallest coherent set of fixes that materially improves trust.
- If you find an edge case, fix it only if it is directly on the touched path.

## Definition of done
Done means:
- code is committed on `feat/rationale-polish-apply-trust`
- required verification passes
- the touched flow is clearer and more trustworthy
- a completion report includes branch, commit, summary, verification, and risks

## Rollback / risk notes
Avoid broadening this into a planner-system overhaul; keep it a UX/trust hardening slice.
