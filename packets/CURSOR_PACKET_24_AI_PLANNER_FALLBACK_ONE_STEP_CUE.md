# Rise-and-Shine Cursor Packet 24 — AI Planner Fallback One-Step Cue

## Header
- Packet name: AI Planner fallback one-step cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-one-step-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-one-step-cue

## Objective
Reduce fallback hesitation by adding a compact cue that reminds the user they only need to try one helpful step to regain momentum instead of treating the backup suggestions like a full plan commitment.

## Why this matters
Packets 12-23 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, and small-start framing. The next narrow trust improvement is one-step framing so the backup path feels even easier to use when the user is overloaded or skeptical.

## Scope
In scope:
- improve fallback one-step wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the user only needs one helpful next step to start.
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
- Keep the one-step cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-one-step-cue`
- verification passes
- Today makes fallback suggestions feel easy to use one step at a time without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
