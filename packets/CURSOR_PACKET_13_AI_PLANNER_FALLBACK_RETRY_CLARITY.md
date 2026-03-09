# Rise-and-Shine Cursor Packet 13 — AI Planner Fallback Retry Clarity

## Header
- Packet name: AI Planner fallback retry clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-retry-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-retry-clarity

## Objective
Reduce uncertainty after fallback by clarifying what the user can do next: review the backup suggestions safely now or retry the full planner later without risking automatic changes.

## Why this matters
Packets 08-12 improved AI Planner trust around loading, empty, review, and fallback states. The next narrow trust improvement is explicit next-step clarity after fallback so the user knows the planner degraded safely and what action makes sense next.

## Scope
In scope:
- improve fallback next-step guidance inside the existing Today AI Planner guidance area
- reinforce that fallback results remain safe to review now and safe to retry later
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
- [ ] Fallback guidance makes the safe next step clearer.
- [ ] Users can tell they may review backup suggestions now or retry later without automatic changes.
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
- Keep fallback next-step guidance compact.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-retry-clarity`
- verification passes
- Today explains the safe next step after fallback more clearly without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
