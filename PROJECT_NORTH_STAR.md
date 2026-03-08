# PROJECT_NORTH_STAR — Rise-and-Shine

## Vision
Use AI to help people get the hang of life and consistently do what makes sense.

## Primary User
Individual operator improving daily life execution **and onboarding AI leverage into their world** through their first personal interactive AI dashboard.

## Core Value
AI-guided task capture and prioritization + next-best-3 + consistency loops + vision clarity.

## MVP Done When
User can:
- onboard and define tasks/needs/vision
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

## Marketing Strategy Alignment (2026-03-08)

### Positioning
An AI-guided life execution system for AI-curious people who want clarity on what to do next—and how to use AI to do it better.

### Ideal Customer Profile (ICP)
- Primary: AI-curious builders/operators who want better life execution and output.
- Expanded: General public in self-improvement/self-help seeking structured guidance and practical AI onboarding.

### Core Marketing Promise
Get onboarded fast, identify your next 3 high-impact actions, break them into bite-size subtasks, and learn where AI can help now and in repetitive workflows over time.

### Activation North-Star Event
User completes onboarding and receives:
1. Outcome-aligned Next 3 tasks.
2. Actionable subtask breakdown for each task.
3. At least one explicit AI-leverage suggestion path.

### Offer Structure
- Free + trial entry includes full onboarding, first Next 3 tasks, subtask breakdown, and AI leverage suggestions.
- Trial window: 7 days.
- Post-trial: upsell to full subscription for ongoing planning, execution support, and deeper AI leverage.

### Deferred (Intentionally Not Finalized Yet)
- 14-day KPI target matrix.
- Experiment matrix and growth test sequencing.

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
