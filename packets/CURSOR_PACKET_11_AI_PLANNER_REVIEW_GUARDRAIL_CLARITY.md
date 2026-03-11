# Rise-and-Shine Cursor Packet 11 — AI Planner Review Guardrail Clarity

## Header
- Packet name: AI Planner review guardrail clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-review-guardrail-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-review-guardrail-clarity

## Objective
Make the AI Planner review state feel safer by clarifying that suggestions remain optional and individually reviewable before any change is applied.

## Why this matters
Packet 10 improved trust during loading. The next narrow improvement is reinforcing safety at the moment suggestions appear so users understand that review is still a guarded, approval-based step rather than an automatic change.

## Scope
In scope:
- improve review-state explanation inside the existing Today AI Planner guidance area
- reinforce that suggestions are optional and approval-gated
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
- `pages/today.js` only if a tiny wording hook is clearly warranted
- one very small helper/component if clearly warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Review guidance makes it clearer that suggestions are optional and approval-gated.
- [ ] Users can tell the review state is still safe and non-destructive.
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
- Prefer calm, confidence-building language over tutorial copy.
- Keep the review-state guidance compact.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-review-guardrail-clarity`
- verification passes
- Today explains review-state approval guardrails more clearly without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
