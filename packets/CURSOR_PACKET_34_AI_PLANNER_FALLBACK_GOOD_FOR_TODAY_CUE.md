# Rise-and-Shine Cursor Packet 34 — AI Planner Fallback Good-for-Today Cue

## Header
- Packet name: AI Planner fallback good-for-today cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-good-for-today-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-good-for-today-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that reassures the user a fallback suggestion can be good enough for today even if they want to improve it later, so they can keep moving without feeling locked in.

## Why this matters
Packets 27-33 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, and revisit-later framing. The next narrow trust improvement is good-for-today framing so the backup path feels usable for the current session without implying permanent commitment.

## Scope
In scope:
- improve fallback good-for-today wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the user can use the backup suggestion for today without treating it as final.
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
- Keep the good-for-today cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-good-for-today-cue`
- verification passes
- Today makes fallback suggestions feel safe to use for the current session without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
