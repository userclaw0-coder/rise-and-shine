# Integrated Goals from ChatGPT Export (background/How started - where going.html)

Date integrated: 2026-03-05
Source: `background/How started - where going.html` (+ exported assets)

## What was extracted (high-signal themes)

1. **Core product promise**
   - Convert user outcomes + current situation into the **next best 3 actions**.
   - Keep cognitive load low; prioritize action and momentum.

2. **Three-engine architecture**
   - Vision Engine (desired future/outcomes)
   - Situation Engine (current tasks/resources/constraints)
   - Action Engine (quick win + high leverage + progress)

3. **Behavior loop**
   - Daily: choose 3, execute, log events, adjust.
   - Weekly: structured strategic review + rebalance.
   - Monthly: reassess outcomes and priorities.

4. **Adaptive prioritization**
   - Dynamic category weighting by mode/energy/context.
   - Default emphasis: Business > Rental House > Vehicles > Home > Boat.

5. **Subtask-first execution strategy**
   - Promote bite-sized subtasks (15–60 min) to reduce friction.
   - Prefer quick-win start for momentum.

6. **Automation strategy (approval-based)**
   - Detect repetitive patterns after execution data accumulates.
   - Suggest n8n/AI automations, require user approval before execution.
   - Log proposals, runs, and outcomes.

7. **Product direction**
   - First usable as personal system, then productized for entrepreneurial users.
   - Differentiator: integrated life/work operating system + AI planning + automation layer.

## Gaps to close in current app

1. Queue behavior should be fully spec-locked (stable next 3, refill when all done).
2. Weekly review outputs should feed planner weighting and queue generation.
3. Vision/Situation data needs tighter coupling to action scoring.
4. Automation opportunities need a dedicated pipeline (detect -> propose -> approve -> run -> learn).
5. Need a persistent "strategy memory" page/model inside app (not only docs).

## Proposed execution roadmap

### Phase 1 — Reliability + Planner Integrity (now)
- Fix lint/effect dependency issues to prevent stale planner state.
- Confirm single scoring source of truth (`lib/scoring.js`).
- Add debug panel for outcome scoring breakdown.

### Phase 2 — Core Planning Loop
- Implement strict daily queue policy + manual refresh.
- Connect weekly review scores/theme to planner inputs.
- Add "why this was chosen" explanation on Today queue cards.

### Phase 3 — Situation Engine + Task Decomposition
- Add structured brain-dump intake that classifies into tasks/projects/ideas/constraints.
- Add subtask suggestion + promote flow for oversized tasks.

### Phase 4 — Automation Layer (n8n + AI)
- Add automation-opportunity detector (rule-based first).
- Add approval queue UI for automation proposals.
- Add n8n webhook trigger + run log + rollback notes.

### Phase 5 — Productization
- Onboarding polish for novice AI users.
- Outcome progress dashboards and proof-of-value views.
- Positioning and growth experiments (early user feedback loop).

## Operating principles for ongoing development

- Minimize user friction.
- Keep every recommendation explainable.
- Prefer reversible changes and event logs.
- Keep automation human-approved.
- Optimize for momentum, not complexity.
