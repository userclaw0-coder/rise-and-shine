# Rise-and-Shine Cursor Packet 41 — AI Planner Fallback Pick-and-Tweak Cue

## Header
- Packet name: AI Planner fallback pick-and-tweak cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-pick-and-tweak-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-pick-and-tweak-cue

## Objective
Reduce fallback hesitation by adding a compact cue that tells the user they can pick a workable option now and tweak it after, so the backup path feels easier to use without feeling locked in.

## Why this matters
Packets 27-40 improved fallback good-enough, imperfect-start, progress-beats-perfection, first-win, low-risk, not-final, revisit-later, good-for-today, next-small-step, one-step-is-enough, start-now, still-counts-today, first-useful-pick, and one-good-option framing. The next narrow trust improvement is a pick-and-tweak cue so fallback guidance reinforces progress without implying the first choice must already be perfect.

## Scope
In scope:
- improve fallback pick-and-tweak wording inside the existing Today AI Planner guidance area
- keep the message compact, calming, and action-oriented
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
- [ ] Fallback guidance makes it clear the user can pick a workable option now and refine it after.
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
- Keep the pick-and-tweak cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-pick-and-tweak-cue`
- verification passes
- Today makes fallback suggestions easier to act on without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
