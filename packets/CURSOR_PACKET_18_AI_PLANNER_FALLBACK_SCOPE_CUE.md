# Rise-and-Shine Cursor Packet 18 — AI Planner Fallback Scope Cue

## Header
- Packet name: AI Planner fallback scope cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-scope-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-scope-cue

## Objective
Reduce fallback uncertainty by adding a compact cue that reminds users the fallback suggestions only affect the current Next 3 review scope, not the broader backlog.

## Why this matters
Packets 12-17 improved fallback safety, retry, reason, confidence, editability, and apply-safety framing. The next narrow trust improvement is scope clarity so users understand the backup path is limited to the current review slice.

## Scope
In scope:
- improve fallback scope wording inside the existing Today AI Planner guidance area
- keep the message compact, reassuring, and action-oriented
- keep the change narrow and local to Today

## Non-goals
Not in scope:
- planner architecture rewrite
- onboarding redesign
- auth changes
- analytics expansion
- backend prompt/model changes
- broad redesign of the planner surface

## Likely files / surfaces
- `components/AiPlannerGuidance.js`
- `pages/today.js` only if a tiny wording hook is clearly warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Fallback guidance makes it clear the current suggestions are limited to the active Next 3 review scope.
- [ ] The wording stays calm, confidence-building, and non-technical.
- [ ] The change remains narrow, user-facing, and reviewable.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

## Verification
Run and report exactly:

```bash
npm run lint
npm run build
```

## Implementation notes
- Prefer calm, confidence-building language over technical qualification.
- Keep the scope cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-scope-cue`
- verification passes
- Today makes fallback scope feel limited and understandable without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
