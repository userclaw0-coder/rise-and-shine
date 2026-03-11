# Rise-and-Shine Cursor Packet 43 — AI Planner Fallback No-Need-To-Decide-Now Cue

## Header
- Packet name: AI Planner fallback no-need-to-decide-now cue
- Date: 2026-03-10
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-no-need-to-decide-now-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-no-need-to-decide-now-cue

## Objective
Reduce fallback pressure by adding a compact cue that tells the user they do not need to decide right now, so the backup path feels supportive even when the best move is to pause and return later.

## Why this matters
Packets 27-42 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, good-for-today, next-small-step, one-step-is-enough, start-now, still-counts-today, first-useful-pick, one-good-option, pick-and-tweak, and revisit-later framing. The next narrow trust improvement is a no-need-to-decide-now cue so fallback guidance reduces pressure even further when the user needs a pause.

## Scope
In scope:
- improve fallback no-need-to-decide-now wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the user does not need to decide immediately if now is not the right moment.
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
- Keep the cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-no-need-to-decide-now-cue`
- verification passes
- Today makes fallback suggestions easier to trust even when the user pauses instead of choosing now
- completion report includes branch, commit, summary, verification, and risks
