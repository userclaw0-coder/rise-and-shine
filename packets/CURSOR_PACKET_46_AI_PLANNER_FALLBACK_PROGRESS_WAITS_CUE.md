# Rise-and-Shine Cursor Packet 46 — AI Planner Fallback Progress-Waits Cue

## Header
- Packet name: AI Planner fallback progress-waits cue
- Date: 2026-03-10
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-progress-waits-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-progress-waits-cue

## Objective
Reduce fallback pressure by adding a compact cue that reassures the user their progress can wait for them, so stepping away feels safe instead of like momentum is lost.

## Why this matters
Packets 27-45 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, good-for-today, next-small-step, one-step-is-enough, start-now, still-counts-today, first-useful-pick, one-good-option, pick-and-tweak, revisit-later, no-need-to-decide-now, pause-is-ok, and come-back-when-ready framing. The next narrow trust improvement is a progress-waits cue so fallback guidance makes it explicit that leaving the planner for later does not erase the value of returning.

## Scope
In scope:
- improve fallback progress-waits wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance reassures the user that stepping away does not lose their momentum and they can return later.
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
- code is committed on `feat/ai-planner-fallback-progress-waits-cue`
- verification passes
- Today makes fallback suggestions easier to trust when the user wants to step away and return later
- completion report includes branch, commit, summary, verification, and risks
