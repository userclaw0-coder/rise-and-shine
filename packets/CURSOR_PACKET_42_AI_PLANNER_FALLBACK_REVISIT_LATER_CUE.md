# Rise-and-Shine Cursor Packet 42 — AI Planner Fallback Revisit-Later Cue

## Header
- Packet name: AI Planner fallback revisit-later cue
- Date: 2026-03-10
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-revisit-later-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-revisit-later-cue

## Objective
Reduce fallback pressure by adding a compact cue that reminds the user they can come back later if none of the backup options feels right yet, so the fallback path feels supportive instead of demanding an immediate perfect choice.

## Why this matters
Packets 27-41 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, good-for-today, next-small-step, one-step-is-enough, start-now, still-counts-today, first-useful-pick, one-good-option, and pick-and-tweak framing. The next narrow trust improvement is a revisit-later cue so fallback guidance stays calm even when the user decides not to act right now.

## Scope
In scope:
- improve fallback revisit-later wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the user can revisit the suggestions later if now is not the right moment.
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
- Keep the revisit-later cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-revisit-later-cue`
- verification passes
- Today makes fallback suggestions easier to trust even when the user waits to act
- completion report includes branch, commit, summary, verification, and risks
