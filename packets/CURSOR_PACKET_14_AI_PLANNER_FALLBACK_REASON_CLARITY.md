# Rise-and-Shine Cursor Packet 14 — AI Planner Fallback Reason Clarity

## Header
- Packet name: AI Planner fallback reason clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-reason-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-reason-clarity

## Objective
Reduce uncertainty after fallback by clarifying, in calm user-facing language, why the planner used the backup path without making the state feel like a failure.

## Why this matters
Packets 12 and 13 improved fallback safety and next-step clarity. The next narrow trust improvement is reason clarity so the user better understands why fallback happened while still feeling safe to continue reviewing suggestions.

## Scope
In scope:
- improve fallback reason wording inside the existing Today AI Planner guidance area
- keep the explanation calm, compact, and confidence-building
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
- [ ] Fallback guidance makes the reason for the backup path easier to understand.
- [ ] The wording stays calm and confidence-building rather than technical or alarming.
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
- Keep the fallback reason explanation compact.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-reason-clarity`
- verification passes
- Today explains fallback reason more clearly without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
