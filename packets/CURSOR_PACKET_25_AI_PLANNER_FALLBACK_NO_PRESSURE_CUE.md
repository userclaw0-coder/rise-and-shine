# Rise-and-Shine Cursor Packet 25 — AI Planner Fallback No-Pressure Cue

## Header
- Packet name: AI Planner fallback no-pressure cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-no-pressure-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-no-pressure-cue

## Objective
Reduce fallback hesitation by adding a compact cue that reassures the user the backup suggestion is a low-pressure starting point they can try, edit, or ignore without feeling locked into a bigger commitment.

## Why this matters
Packets 12-24 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, and one-step framing. The next narrow trust improvement is no-pressure framing so the backup path feels even safer to engage when the user is overloaded or skeptical.

## Scope
In scope:
- improve fallback no-pressure wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the backup suggestion is a low-pressure starting point rather than a commitment.
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
- Keep the no-pressure cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-no-pressure-cue`
- verification passes
- Today makes fallback suggestions feel safer to try without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
