# Rise-and-Shine Cursor Packet 23 — AI Planner Fallback Small-Start Cue

## Header
- Packet name: AI Planner fallback small-start cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-small-start-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-small-start-cue

## Objective
Reduce fallback hesitation by adding a compact cue that frames the backup suggestions as a small, low-pressure way to start progress without needing a perfect plan first.

## Why this matters
Packets 12-22 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, and momentum framing. The next narrow trust improvement is small-start framing so the backup path feels easy to begin with right now.

## Scope
In scope:
- improve fallback small-start wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance frames the current suggestions as a small, low-pressure place to start.
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
- Keep the small-start cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-small-start-cue`
- verification passes
- Today makes fallback suggestions feel easy to begin with without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
