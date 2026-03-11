# Rise-and-Shine Cursor Packet 29 — AI Planner Fallback Progress-Beats-Perfection Cue

## Header
- Packet name: AI Planner fallback progress-beats-perfection cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-progress-beats-perfection-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-progress-beats-perfection-cue

## Objective
Reduce perfection pressure around fallback guidance by adding a compact cue that reassures the user forward progress matters more than polishing the fallback suggestion first.

## Why this matters
Packets 12-28 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, one-step, no-pressure, try-now, good-enough, and imperfect-start framing. The next narrow trust improvement is progress-beats-perfection framing so the backup path feels useful even when the user is tempted to keep refining before taking any action.

## Scope
In scope:
- improve fallback progress-beats-perfection wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear that visible progress matters more than a perfect first draft.
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
- Keep the progress-beats-perfection cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-progress-beats-perfection-cue`
- verification passes
- Today makes fallback suggestions feel easier to use without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
