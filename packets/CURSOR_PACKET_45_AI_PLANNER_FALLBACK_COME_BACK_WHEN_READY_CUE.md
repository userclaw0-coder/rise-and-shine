# Rise-and-Shine Cursor Packet 45 — AI Planner Fallback Come-Back-When-Ready Cue

## Header
- Packet name: AI Planner fallback come-back-when-ready cue
- Date: 2026-03-10
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-come-back-when-ready-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-come-back-when-ready-cue

## Objective
Reduce fallback pressure by adding a compact cue that reassures the user they can come back when ready, so the backup path stays supportive without making a paused moment feel like failure.

## Why this matters
Packets 27-44 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, good-for-today, next-small-step, one-step-is-enough, start-now, still-counts-today, first-useful-pick, one-good-option, pick-and-tweak, revisit-later, no-need-to-decide-now, and pause-is-ok framing. The next narrow trust improvement is a come-back-when-ready cue so fallback guidance remains calm while still leaving the door open for a later restart.

## Scope
In scope:
- improve fallback come-back-when-ready wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance reassures the user they can come back when ready if none of the options fits yet.
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
- code is committed on `feat/ai-planner-fallback-come-back-when-ready-cue`
- verification passes
- Today makes fallback suggestions easier to trust when the user wants to return later instead of choosing now
- completion report includes branch, commit, summary, verification, and risks
