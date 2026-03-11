# Rise-and-Shine Cursor Packet 36 — AI Planner Fallback One-Step-Is-Enough Cue

## Header
- Packet name: AI Planner fallback one-step-is-enough cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-one-step-is-enough-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-one-step-is-enough-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that reassures the user one useful step is enough for now, so they can act without feeling pressure to solve the whole day at once.

## Why this matters
Packets 27-35 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, revisit-later, good-for-today, and next-small-step framing. The next narrow trust improvement is one-step-is-enough framing so the backup path feels complete enough to try in the current session without implying a bigger commitment.

## Scope
In scope:
- improve fallback one-step-is-enough wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear that trying one useful step is enough for now.
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
- Keep the one-step-is-enough cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-one-step-is-enough-cue`
- verification passes
- Today makes fallback suggestions feel easier to try without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
