# Rise-and-Shine Cursor Packet 35 — AI Planner Fallback Next-Small-Step Cue

## Header
- Packet name: AI Planner fallback next-small-step cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-next-small-step-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-next-small-step-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that frames the backup suggestion as one useful next small step, so the user can keep moving without feeling like they must commit to a full plan.

## Why this matters
Packets 27-34 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, revisit-later, and good-for-today framing. The next narrow trust improvement is next-small-step framing so the backup path feels easy to try in the current session without implying a bigger commitment.

## Scope
In scope:
- improve fallback next-small-step wording inside the existing Today AI Planner guidance area
- keep the message compact, reassuring, and action-oriented
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
- [ ] Fallback guidance makes it clear the backup suggestion is one useful next small step, not a big commitment.
- [ ] The wording stays calm, confidence-building, and non-technical.
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
- Prefer calm, confidence-building language over technical qualification.
- Keep the next-small-step cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-next-small-step-cue`
- verification passes
- Today makes fallback suggestions feel easier to try without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
