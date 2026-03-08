# PROJECT_NORTH_STAR — Rise-and-Shine

## Vision
Help AI-curious people improve life execution by giving clear next actions and practical AI leverage guidance they can apply immediately.

## Primary User
- Primary: AI-curious builders/operators who want better daily execution and output.
- Expanded: General public in self-improvement/self-help who want structured guidance and practical AI onboarding.

## Core Value
Fast onboarding into an AI-guided execution loop: identify the next 3 high-impact actions, break them into bite-size subtasks, and surface where AI can help now and for repeatable future workflows.

## MVP Done When
User can:
- complete onboarding and define outcomes/tasks/needs/vision
- receive an outcome-aligned Next 3 action set
- see each Next 3 action broken into actionable subtasks
- identify at least one explicit AI-leverage path during onboarding + first planning cycle
- capture/add tasks quickly and review category/project pages
- execute the daily queue and complete weekly review flow
- review meaningful analytics
- view an inspirational AI-generated vision board integrating their photo

## Activation North-Star Event
User completes onboarding and receives:
1. Outcome-aligned Next 3 tasks.
2. Actionable subtask breakdown for each task.
3. At least one explicit AI-leverage suggestion path.

## Offer Structure
- Free + trial entry includes full onboarding, first Next 3 tasks, subtask breakdown, and AI leverage suggestions.
- Trial window: 7 days.
- Post-trial: upsell to full subscription for ongoing planning, execution support, and deeper AI leverage.

## Not Now
Business CRM/sales/enterprise operator workflows.

## 30-Day Win
Stable onboarding-to-Next-3 execution loop with clear completion/consistency gains and visible AI-leverage adoption in early users.

## Change Note (2026-03-08)
Marketing strategy decisions were integrated directly into canonical sections (Vision/Primary User/Core Value/MVP/Activation/Offer) to avoid parallel narratives and source-of-truth drift.

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
