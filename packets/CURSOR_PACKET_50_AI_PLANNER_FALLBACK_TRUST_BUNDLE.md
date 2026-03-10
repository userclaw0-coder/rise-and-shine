# Rise-and-Shine Packet 50 — AI Planner Fallback Trust Bundle

## Goal
Replace the recent one-cue-at-a-time fallback copy chain with a coherent fallback-trust bundle that makes the backup path feel safe, non-punitive, and easy to resume.

## Why this replaces the tiny-slice chain
Recent packets 43–50 were semantically adjacent: no pressure, pause is ok, come back when ready, progress waits, resume here, return is easy, no catch-up. These are all one larger UX question:

**"If the AI Planner falls back, can I safely pause, return later, and still feel in control?"**

This packet should answer that question in one stronger slice.

## Branch / worktree
- Base: `develop`
- Branch: `feat/ai-planner-fallback-trust-bundle`
- Worktree: `/home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-trust-bundle`

## Scope
Bundle adjacent fallback-trust improvements into one coherent guidance pass:
- no pressure to act immediately
- pause is okay
- returning later is easy
- no need to catch up from scratch
- clear starting/resume guidance
- keep the message calm and confidence-building

## Non-goals
- no planner backend rewrite
- no auth/onboarding redesign
- no broad UI redesign outside planner guidance

## Likely files
- `components/AiPlannerGuidance.js`
- `pages/today.js` only if a small integration hook is truly needed

## Acceptance criteria
- Fallback guidance feels materially more complete and trustworthy as one surface.
- Users can understand they may pause, resume, and proceed without penalty or confusion.
- The change remains local and reviewable.
- `npm run lint` passes.
- `npm run build` passes.

## Verification
- `npm run lint`
- `npm run build`

## Completion report
Return:
- branch name
- commit hash
- concise summary
- verification commands + results
- risks or follow-ups
