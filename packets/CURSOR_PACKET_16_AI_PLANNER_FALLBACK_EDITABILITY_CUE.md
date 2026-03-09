# Rise-and-Shine Cursor Packet 16 — AI Planner Fallback Editability Cue

## Header
- Packet name: AI Planner fallback editability cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-editability-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-editability-cue

## Objective
Reduce hesitation after fallback by adding a compact cue that reminds the user they can edit and refine fallback suggestions before applying them.

## Why this matters
Packets 12-15 improved fallback safety, retry, reason, and confidence clarity. The next narrow trust improvement is editability framing so users understand fallback output is not locked in and can be adjusted to fit their day before they continue.

## Scope
In scope:
- improve fallback editability wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear the user can edit/refine the current suggestions before applying them.
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
- Keep the editability cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-editability-cue`
- verification passes
- Today makes fallback output feel adjustable without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
