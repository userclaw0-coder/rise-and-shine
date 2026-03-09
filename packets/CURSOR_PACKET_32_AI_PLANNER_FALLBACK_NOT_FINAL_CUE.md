# Rise-and-Shine Cursor Packet 32 — AI Planner Fallback Not-Final Cue

## Header
- Packet name: AI Planner fallback not-final cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-not-final-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-not-final-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that reminds the user the fallback suggestion is not a final commitment, so they feel safe starting with it and refining later.

## Why this matters
Packets 12-31 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, one-step, no-pressure, try-now, good-enough, imperfect-start, progress-beats-perfection, first-win, and low-risk framing. The next narrow trust improvement is not-final framing so the backup path feels easy to test without fear of locking into the wrong plan.

## Scope
In scope:
- improve fallback not-final wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the suggestion is a safe starting point, not a final commitment.
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
- Keep the not-final cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-not-final-cue`
- verification passes
- Today makes fallback suggestions feel safer to try without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
