# Rise-and-Shine Cursor Packet 15 — AI Planner Fallback Confidence Cue

## Header
- Packet name: AI Planner fallback confidence cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-confidence-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-confidence-cue

## Objective
Reduce hesitation after fallback by adding a compact confidence cue that tells the user the current suggestions are still safe starting points they can review, edit, and use.

## Why this matters
Packets 12-14 improved fallback safety, retry, and reason clarity. The next narrow trust improvement is confidence framing so users understand the fallback state is still usable and not something they need to fear before continuing.

## Scope
In scope:
- improve fallback confidence wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance reinforces that the current suggestions are still usable.
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
- Keep the confidence cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-confidence-cue`
- verification passes
- Today makes fallback output feel safe to use without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
