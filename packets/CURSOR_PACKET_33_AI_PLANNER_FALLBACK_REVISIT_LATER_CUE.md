# Rise-and-Shine Cursor Packet 33 — AI Planner Fallback Revisit-Later Cue

## Header
- Packet name: AI Planner fallback revisit-later cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-revisit-later-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-revisit-later-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that reminds the user they can start with one fallback suggestion now and revisit it later, so they do not feel pressure to make the backup path perfect in one pass.

## Why this matters
Packets 12-32 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, one-step, no-pressure, try-now, good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, and not-final framing. The next narrow trust improvement is revisit-later framing so the backup path feels safe to use now without feeling like a one-shot decision.

## Scope
In scope:
- improve fallback revisit-later wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the user can revisit and adjust the backup suggestion later.
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
- Today makes fallback suggestions feel safer to try without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
