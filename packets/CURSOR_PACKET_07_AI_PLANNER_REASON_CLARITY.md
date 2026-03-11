# Rise-and-Shine Cursor Packet 07 — AI Planner Reason Clarity

## Header
- Packet name: AI Planner reason clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-reason-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-reason-clarity

## Objective
Make fallback and error states easier to trust by turning terse internal planner reason strings into clearer user-facing explanations inside the existing Today AI Planner guidance.

## Why this matters
Packet 06 improved trust across empty, loading, and fallback states. The next narrow improvement is removing leftover machine-feeling status language so users understand what happened without reading raw internal labels.

## Scope
In scope:
- humanize fallback/error reason messaging inside the existing AI Planner guidance area
- keep the change narrow and local to Today
- preserve the current approval-safe posture

## Non-goals
Not in scope:
- planner architecture rewrite
- onboarding redesign
- auth changes
- analytics expansion
- backend prompt/model changes
- broad copy rewrite outside the planner guidance surface

## Likely files / surfaces
- `components/AiPlannerGuidance.js`
- `pages/today.js`
- one very small helper only if clearly warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Fallback or error reasons are explained in clearer plain language when available.
- [ ] The planner feels less machine-ish without broad redesign.
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
- Prefer calm, trust-building language over technical phrasing.
- Keep the logic easy to review.
- Avoid introducing new planner states unless truly required.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-reason-clarity`
- verification passes
- Today explains planner fallback/error reasons more clearly in the existing guidance surface
- completion report includes branch, commit, summary, verification, and risks
