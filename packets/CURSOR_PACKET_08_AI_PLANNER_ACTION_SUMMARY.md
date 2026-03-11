# Rise-and-Shine Cursor Packet 08 — AI Planner Action Summary

## Header
- Packet name: AI Planner action summary
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-action-summary
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-action-summary

## Objective
Make the Today AI Planner easier to act on by adding a compact summary of what kinds of suggestions are currently ready to review before the user scans the full list.

## Why this matters
Packet 07 made planner state messaging easier to trust. The next narrow improvement is helping users understand the size and shape of the current review workload at a glance so the planner feels more actionable, not just clearer.

## Scope
In scope:
- add a compact suggestion summary inside the existing Today AI Planner area
- clarify counts or categories of pending planner suggestions before the detailed list
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
- `pages/today.js`
- `components/AiPlannerGuidance.js`
- one very small helper/component if clearly warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Users can see a concise summary of pending planner suggestion types before scanning the full review UI.
- [ ] The planner feels more actionable without adding clutter.
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
- Favor quick comprehension over visual flourish.
- Reuse existing planner language where practical.
- Keep the summary useful even when only one suggestion type is present.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-action-summary`
- verification passes
- Today shows a compact, clearer summary of current planner suggestion workload
- completion report includes branch, commit, summary, verification, and risks
