# Rise-and-Shine Cursor Packet 48 — AI Planner Fallback Return-Is-Easy Cue

## Header
- Packet name: AI Planner fallback return-is-easy cue
- Date: 2026-03-10
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-return-is-easy-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-return-is-easy-cue

## Objective
Reduce fallback friction by adding a compact cue that reassures the user returning later will feel easy, so stepping away from Today does not feel like abandoning progress.

## Why this matters
Packets 27-47 improved fallback confidence across good-enough, pause-is-ok, come-back-when-ready, progress-waits, and resume-here framing. The next narrow trust improvement is a return-is-easy cue so the user feels re-entry will be simple when they come back to Today.

## Scope
In scope:
- improve fallback return-is-easy wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance reassures the user that coming back later will feel easy and low-friction.
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
- Keep the cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-return-is-easy-cue`
- verification passes
- Today makes fallback suggestions easier to trust when the user wants to leave and return later
- completion report includes branch, commit, summary, verification, and risks
