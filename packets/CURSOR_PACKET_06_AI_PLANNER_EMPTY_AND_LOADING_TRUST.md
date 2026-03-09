# Rise-and-Shine Cursor Packet 06 — AI Planner Empty + Loading Trust States

## Header
- Packet name: AI Planner empty and loading trust states
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-empty-loading-trust
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-empty-loading-trust

## Objective
Improve trust in the Today AI Planner before and during suggestion generation by making empty, loading, and safe-fallback states clearer and more reassuring.

## Why this matters
Packet 05 clarified what to do after suggestions load. The next narrow trust-building slice is making the planner feel predictable before results arrive so users understand that the system is working, what it is doing, and what safe fallback behavior to expect.

## Scope
In scope:
- add concise empty/loading/fallback guidance inside the existing AI Planner section
- make waiting states feel intentional rather than ambiguous
- reinforce safe fallback behavior in plain language
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
- `components/AiPlannerGuidance.js`
- one very small helper/component if warranted

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] The AI Planner explains empty/loading/fallback states more clearly before suggestions appear.
- [ ] Waiting for suggestions feels more trustworthy without broad redesign.
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
- code is committed on `feat/ai-planner-empty-loading-trust`
- verification passes
- Today makes the AI Planner waiting/empty states clearer and safer to trust
- completion report includes branch, commit, summary, verification, and risks
