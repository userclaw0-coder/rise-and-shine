# Rise-and-Shine Cursor Packet 47 — AI Planner Fallback Resume-Here Cue

## Header
- Packet name: AI Planner fallback resume-here cue
- Date: 2026-03-10
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-resume-here-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-resume-here-cue

## Objective
Reduce fallback friction by adding a compact cue that reassures the user they can resume right here later, so leaving the planner feels reversible instead of like they need to restart the whole process.

## Why this matters
Packets 27-46 improved fallback confidence across good-enough, first useful step, pause-is-ok, come-back-when-ready, and progress-waits framing. The next narrow trust improvement is a resume-here cue so Today explicitly feels like a safe place to return to later.

## Scope
In scope:
- improve fallback resume-here wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance reassures the user they can return to Today later without needing to start over.
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
- code is committed on `feat/ai-planner-fallback-resume-here-cue`
- verification passes
- Today makes fallback suggestions easier to trust when the user wants to leave and return later
- completion report includes branch, commit, summary, verification, and risks
