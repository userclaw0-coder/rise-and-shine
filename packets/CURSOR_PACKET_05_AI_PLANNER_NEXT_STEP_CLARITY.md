# Rise-and-Shine Cursor Packet 05 — AI Planner Next-Step Clarity

## Header
- Packet name: AI Planner next-step clarity
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-next-step-clarity
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-next-step-clarity

## Objective
Improve the Today AI Planner surface so users can more clearly tell what to do after suggestions load, especially around review, approval, apply behavior, and safe fallback expectations.

## Why this matters
Rise-and-Shine depends on trust in the AI-assisted planning loop. The queue-behavior slice clarified how the Next 3 behaves; the next narrow trust-building improvement is making the AI Planner section feel more guided and predictable without changing planner architecture.

## Scope
In scope:
- add concise next-step guidance or status cues inside the existing AI Planner section
- make the approval/apply path clearer once suggestions are present
- reinforce fallback/safe behavior in plain language
- keep the change narrow and local to Today

## Non-goals
Not in scope:
- planner architecture rewrite
- onboarding redesign
- auth changes
- analytics expansion
- backend prompt/model changes unless required for a tiny UI-state hook

## Likely files / surfaces
- `pages/today.js`
- one very small helper/component if warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] The AI Planner section gives users a clearer sense of what happens next after suggestions load.
- [ ] The approval/apply path feels more trustworthy without broad redesign.
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
- Prefer plain-language trust-building copy/state cues over heavy UI.
- Keep it useful for first-week users.
- Avoid turning this into a tutorial system.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-next-step-clarity`
- verification passes
- Today makes the AI Planner next step clearer and safer to follow
- completion report includes branch, commit, summary, verification, and risks
