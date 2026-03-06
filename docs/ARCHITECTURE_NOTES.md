# Architecture Notes

## 2026-03-06 — Incremental `lib/db.js` decomposition plan

Goal: reduce regression blast radius in the monolithic data layer without broad refactors.

### Sequencing
1. Extract planner refinement event query logic into a focused module (`lib/db/planner-refinement-events.js`).
2. Extract planner apply read/write data access helpers next (keep API route contracts unchanged).
3. Extract daily-plan queue persistence helpers after planner domain extraction stabilizes.

### Guardrails
- One bounded domain extraction per iteration.
- No behavior changes during extraction passes; preserve existing call signatures.
- Require release verification (`npm run verify:release`) before merge/push.
