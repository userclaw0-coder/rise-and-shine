# Rise-and-Shine Cursor Packet 30 — AI Planner Fallback First-Win Cue

## Header
- Packet name: AI Planner fallback first-win cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-first-win-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-first-win-cue

## Objective
Reduce hesitation around fallback guidance by adding a compact cue that frames the suggestion as a useful first win, so users feel comfortable taking a small step before refining further.

## Why this matters
Packets 12-29 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, quick-review, first-edit, starting-point, momentum, small-start, one-step, no-pressure, try-now, good-enough, imperfect-start, and progress-beats-perfection framing. The next narrow trust improvement is first-win framing so the backup path feels like a small success users can act on immediately rather than a draft they must perfect first.

## Scope
In scope:
- improve fallback first-win wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance frames the suggestion as a useful first win rather than something the user needs to perfect before acting.
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
- Keep the first-win cue compact and naturally integrated with existing fallback messaging.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-first-win-cue`
- verification passes
- Today makes fallback suggestions feel easier to use without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
