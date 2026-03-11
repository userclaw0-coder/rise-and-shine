# Rise-and-Shine Cursor Packet 17 — AI Planner Fallback Apply-Safety Cue

## Header
- Packet name: AI Planner fallback apply-safety cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-apply-safety-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-apply-safety-cue

## Objective
Reduce last-step hesitation after fallback by adding a compact cue that explains applying fallback suggestions is still a safe draft-like step, not an irreversible commitment.

## Why this matters
Packets 12-16 improved fallback safety, retry, reason, confidence, and editability. The next narrow trust improvement is apply-safety framing so users understand they can move forward without feeling locked in.

## Scope
In scope:
- improve fallback apply-safety wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance makes it clear applying the current suggestions remains a safe, revisable step.
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
- Keep the apply-safety cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-apply-safety-cue`
- verification passes
- Today makes fallback apply feel safe and revisable without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
