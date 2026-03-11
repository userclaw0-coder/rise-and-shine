# Rise-and-Shine Cursor Packet 31 — AI Planner Fallback Low-Risk Cue

## Header
- Packet name: AI Planner fallback low-risk cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-low-risk-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-low-risk-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that frames the suggestion as a low-risk place to start, so users feel safe taking the step before refining it further.

## Why this matters
Packets 12-30 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, one-step, no-pressure, try-now, good-enough, imperfect-start, progress-beats-perfection, and first-win framing. The next narrow trust improvement is low-risk framing so the backup path feels safe to use immediately rather than something that might create extra cleanup.

## Scope
In scope:
- improve fallback low-risk wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance frames the suggestion as a low-risk step the user can take before refining further.
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
- Keep the low-risk cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-low-risk-cue`
- verification passes
- Today makes fallback suggestions feel safer to use without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
