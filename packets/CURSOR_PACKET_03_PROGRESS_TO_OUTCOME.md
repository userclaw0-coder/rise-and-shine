# Rise-and-Shine Cursor Packet 03 — Progress-to-Outcome Visibility

## Header
- Packet name: Progress-to-outcome visibility slice
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/progress-to-outcome-visibility
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-progress-to-outcome-visibility

## Objective
Add a narrow, user-visible progress-to-outcome layer that helps users see how current actions connect to meaningful progress, without broadening into analytics overhaul.

## Why this matters
The current canonical priorities include progress-to-outcome visibility. After rationale and subtask-trust improvements, the next trust-building step is helping users see the connection between completed/current tasks and larger progress.

## Scope
In scope:
- add one clear progress-to-outcome surface on an existing page (prefer Today if coherent)
- connect near-term task progress to a higher-level outcome or momentum signal
- keep implementation narrow and understandable
- preserve current planner/auth/apply stability

## Non-goals
Not in scope:
- full analytics redesign
- broad onboarding changes
- planner architecture rewrite
- new reporting system
- deployment verification

## Likely files / surfaces
- `pages/today.js`
- `components/OutcomeExplanation.js`
- `components/SectionCard.js`
- `lib/scoring.js`
- any small helper needed for progress calculation/presentation

## Repo boundary reminders
- Routine work stays on `develop` branches only.
- Preserve the stabilized planner/apply/auth baseline.
- Keep validation local-first.

## Acceptance criteria
- [ ] Users can see a clear progress-to-outcome signal on the touched surface.
- [ ] The signal is understandable without requiring a new analytics page.
- [ ] The implementation remains narrow and trustworthy.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

## Verification
Run and report exactly:

```bash
npm run lint
npm run build
```

## Implementation notes
- Prefer clarity over quantified complexity.
- Make the outcome connection legible, not theoretical.
- Keep the slice user-facing and reviewable.

## Definition of done
Done means:
- code is committed on `feat/progress-to-outcome-visibility`
- verification passes
- a clear progress-to-outcome signal exists on the touched surface
- completion report includes branch, commit, summary, verification, and risks
