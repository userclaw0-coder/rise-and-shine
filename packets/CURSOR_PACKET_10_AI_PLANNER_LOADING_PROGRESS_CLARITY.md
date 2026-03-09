# Rise-and-Shine Cursor Packet 10 — AI Planner Loading Progress Clarity

## Header
- Packet name: AI Planner loading progress clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-loading-progress-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-loading-progress-clarity

## Objective
Make the AI Planner feel more trustworthy while waiting by clarifying that the planner is actively reviewing the current Next 3 and that no task changes happen during loading.

## Why this matters
Packet 09 clarified no-change outcomes. The next narrow improvement is reducing ambiguity during the waiting moment itself so users feel confident the planner is working and still operating safely before suggestions appear.

## Scope
In scope:
- improve loading-state explanation inside the existing Today AI Planner guidance area
- reinforce that loading is active review, not a frozen state
- clarify that tasks remain unchanged during loading
- keep the change narrow and local to Today

## Non-goals
Not in scope:
- planner architecture rewrite
- onboarding redesign
- auth changes
- analytics expansion
- backend prompt/model changes
- broad redesign of the planner review surface

## Likely files / surfaces
- `components/AiPlannerGuidance.js`
- `pages/today.js` only if a tiny state hook is clearly warranted
- one very small helper/component if clearly warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Loading guidance makes it clearer that the planner is actively reviewing the queue.
- [ ] Users can tell that no task changes occur while loading.
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
- Prefer calm, confidence-building language over verbose explanation.
- Keep the loading-state guidance compact.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-loading-progress-clarity`
- verification passes
- Today explains planner loading progress more clearly without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
