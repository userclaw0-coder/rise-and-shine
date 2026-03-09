# Rise-and-Shine Cursor Packet 27 — AI Planner Fallback Good-Enough Cue

## Header
- Packet name: AI Planner fallback good-enough cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-good-enough-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-good-enough-cue

## Objective
Reduce overthinking around fallback guidance by adding a compact cue that reassures the user one good-enough next step is enough to regain momentum.

## Why this matters
Packets 12-26 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, one-step, no-pressure, and try-now framing. The next narrow trust improvement is good-enough framing so the backup path feels usable even when the user does not want to perfect the suggestion before moving.

## Scope
In scope:
- improve fallback good-enough wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear that one good-enough next move is enough to get unstuck.
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
- Keep the good-enough cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-good-enough-cue`
- verification passes
- Today makes fallback suggestions feel easier to use without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
