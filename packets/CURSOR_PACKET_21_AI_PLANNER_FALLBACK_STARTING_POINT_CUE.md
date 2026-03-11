# Rise-and-Shine Cursor Packet 21 — AI Planner Fallback Starting-Point Cue

## Header
- Packet name: AI Planner fallback starting-point cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-starting-point-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-starting-point-cue

## Objective
Reduce fallback hesitation by adding a compact cue that frames the backup suggestions as a usable starting point users can refine, rather than something they need to judge as final before acting.

## Why this matters
Packets 12-20 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, and first-edit framing. The next narrow trust improvement is starting-point framing so the backup path feels like a draft users can work from instead of a final answer they have to fully endorse.

## Scope
In scope:
- improve fallback starting-point wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance frames the current suggestions as a strong starting point users can refine before applying.
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
- Keep the starting-point cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-starting-point-cue`
- verification passes
- Today makes fallback suggestions feel like a practical starting point without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
