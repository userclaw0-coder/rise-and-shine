# Rise-and-Shine Cursor Packet 20 — AI Planner Fallback First-Edit Cue

## Header
- Packet name: AI Planner fallback first-edit cue
- Date: 2026-03-09
- Owner: OpenClaw / Tom Saunders
- Repo: rise-and-shine
- Base branch: develop
- Working branch: feat/ai-planner-fallback-first-edit-cue
- Worktree path: /home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-first-edit-cue

## Objective
Reduce fallback hesitation by adding a compact cue that suggests users can start with one quick edit before applying, instead of feeling pressure to review everything at once.

## Why this matters
Packets 12-19 improved fallback safety, retry, reason, confidence, editability, apply-safety, scope, and quick-review framing. The next narrow trust improvement is first-edit framing so the backup path feels easy to tune in one small step rather than like a full rewrite.

## Scope
In scope:
- improve fallback first-edit wording inside the existing Today AI Planner guidance area
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
- [ ] Fallback guidance suggests users can begin with one small edit before applying.
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
- Keep the first-edit cue compact and actionable.
- Reuse existing planner guidance patterns where practical.

## Definition of done
Done means:
- code is committed on `feat/ai-planner-fallback-first-edit-cue`
- verification passes
- Today makes fallback suggestions feel easy to tune in one small step without broadening the surface
- completion report includes branch, commit, summary, verification, and risks
