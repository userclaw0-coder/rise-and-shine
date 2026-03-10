# Rise-and-Shine Packet 52 — AI Planner Fallback Action Path Bundle

## Goal
Build on the fallback trust bundle by making the fallback review state feel more actionable: one useful next move, clear apply safety, and a calmer path from suggestion to progress.

## Why this is the next larger slice
Packet 51 answers **"Is the fallback state safe and trustworthy?"**
The next MVP question is:

**"Now that I trust the fallback path, what should I actually do with it right now?"**

This packet bundles adjacent apply-path and review-confidence improvements into one coherent Today slice instead of returning to tiny reassurance packets.

## Branch / worktree
- Base: `develop`
- Branch: `feat/ai-planner-fallback-action-path-bundle`
- Worktree: `/home/clawofhank/rise-and-shine/.worktrees/feat-ai-planner-fallback-action-path-bundle`

## Scope
Bundle adjacent fallback review/action-path improvements inside Today:
- make the immediate next step more obvious
- reinforce one-at-a-time apply safety
- make tweak/apply/revisit options feel clearer and lower pressure
- keep guidance compact and useful, not verbose
- stay local to Today planner guidance/review surfaces

## Non-goals
- no planner backend rewrite
- no onboarding/auth redesign
- no analytics changes
- no broad redesign outside planner fallback/review surfaces

## Likely files
- `components/AiPlannerGuidance.js`
- `pages/today.js` if a small integration hook is clearly warranted
- related small planner review components only if needed to keep the slice coherent

## Acceptance criteria
- Fallback review feels more actionable, not just reassuring.
- Users can quickly understand a useful next move and the safety of applying one suggestion at a time.
- The change remains narrow, local, and reviewable.
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
