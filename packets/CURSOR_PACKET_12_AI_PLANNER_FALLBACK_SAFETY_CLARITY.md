# Rise-and-Shine Cursor Packet 12 — AI Planner Fallback Safety Clarity

## Header
- Packet name: AI Planner fallback safety clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-safety-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-safety-clarity

## Objective
Make fallback states feel safer by clarifying that when the full AI path is unavailable, the planner uses a safer backup path and still avoids changing anything automatically.

## Why this matters
Recent packets improved trust for loading, empty, and review states. The next narrow trust improvement is making fallback behavior feel clearly controlled so users understand the planner degrades safely rather than acting unpredictably.

## Scope
In scope:
- improve fallback-state explanation inside the existing Today AI Planner guidance area
- reinforce that fallback behavior stays safe and non-destructive
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
- [ ] Fallback guidance makes it clearer that the planner used a safer backup path.
- [ ] Users can tell fallback remains non-destructive and approval-based.
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
- Prefer calm, confidence-building language over technical error framing.
- Keep fallback-state guidance compact.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-safety-clarity`
- verification passes
- Today explains fallback safety more clearly without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
