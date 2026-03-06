# PROJECT_NORTH_STAR — Rise-and-Shine

## Vision
Use AI to help people get the hang of life and consistently do what makes sense.

## Primary User
Individual operator improving daily life execution **and onboarding AI leverage into their world** through their first personal interactive AI dashboard.

## Core Value
AI-guided prioritization + next-best-3 + consistency loops + vision clarity.

## MVP Done When
User can:
- onboard and define needs/vision
- capture tasks quickly
- execute daily queue
- identify beginner AI leverage opportunities (chat-based AI or API in app)
- review meaningful analytics
- view an inspirational AI-generated vision board integrating their photo
- add tasks easily and review category/project pages
- complete weekly review flow

## Not Now
Business CRM/sales/enterprise operator workflows.

## 30-Day Win
Stable daily execution loop with clear completion/consistency gains.

---

## Architecture Review Addendum (2026-03-06)

### Current architecture strengths
- Clear product loop coverage (onboarding → daily execution → analytics).
- Deterministic verification scripts exist for core planner paths (`verify:scoring`, `verify:queue`, `verify:planner`, `verify:refinement-events`).
- Recent auth-boundary hardening in planner APIs is directionally correct.

### Highest architecture risks now
1. **Monolithic data-access layer (`lib/db.js`) still carries multi-domain responsibility.**
2. **Planner apply path uses compensating rollback instead of a true transactional boundary.**
3. **Runtime artifacts (`.next`, `node_modules`, `n8n_data`) remain in active repo surface and increase operational drift risk.**

### North-star aligned architecture priorities (next 30 days)
- Finish bounded decomposition of `lib/db.js` into domain modules (planner/events/tasks/profile).
- Introduce atomic planner apply writes (DB transaction/RPC) for task + tags + events.
- Tighten repo hygiene and runtime separation so source-of-truth stays code/docs only.

### Concrete development tasks
- Ship `lib/db/*` domain extraction plan in 3 PRs with unchanged public interfaces.
- Replace endpoint-local rollback logic with atomic DB-level write unit and explicit failure semantics.
- Add `.gitignore`/ops cleanup for mutable runtime files and keep n8n state outside tracked repo paths.
