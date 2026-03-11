# Rise-and-Shine Cursor Packet 39 — AI Planner Fallback First-Useful-Pick Cue

## Header
- Packet name: AI Planner fallback first-useful-pick cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-first-useful-pick-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-first-useful-pick-cue

## Objective
Reduce fallback hesitation by adding a compact cue that tells the user they only need to pick the first suggestion that feels useful, so they do not feel pressure to compare every option before moving.

## Why this matters
Packets 27-38 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, revisit-later, good-for-today, next-small-step, one-step-is-enough, start-now, and still-counts-today framing. The next narrow trust improvement is a first-useful-pick cue so the backup path feels easier to act on when several suggestions are visible.

## Scope
In scope:
- improve fallback first-useful-pick wording inside the existing Today AI Planner guidance area
- keep the message compact, calming, and action-oriented
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
- [ ] Fallback guidance makes it clear the user can choose the first suggestion that feels useful instead of evaluating everything.
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
- Keep the first-useful-pick cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-first-useful-pick-cue`
- verification passes
- Today makes fallback suggestions easier to act on without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
