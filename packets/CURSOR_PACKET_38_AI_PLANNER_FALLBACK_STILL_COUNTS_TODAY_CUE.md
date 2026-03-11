# Rise-and-Shine Cursor Packet 38 — AI Planner Fallback Still-Counts-Today Cue

## Header
- Packet name: AI Planner fallback still-counts-today cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-still-counts-today-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-still-counts-today-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that reassures the user even a small start still counts as real progress today, so they do not feel the backup path is too minor to matter.

## Why this matters
Packets 27-37 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, revisit-later, good-for-today, next-small-step, one-step-is-enough, and start-now framing. The next narrow trust improvement is a still-counts-today cue so the backup path feels worthwhile in the current session even when the step is intentionally small.

## Scope
In scope:
- improve fallback still-counts-today wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear that a small suggested step still counts as useful progress today.
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
- Keep the still-counts-today cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-still-counts-today-cue`
- verification passes
- Today makes fallback suggestions feel worthwhile to act on without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
