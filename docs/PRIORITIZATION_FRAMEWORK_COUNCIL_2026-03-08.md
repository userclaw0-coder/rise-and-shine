# Prioritization Framework Council Packet (2026-03-08)

## 1) Current Scoring Logic Map (as implemented)

Source of truth: `lib/scoring.js` + `pages/api/plan/refill.js`

### Candidate selection
- Pulls caller's `todo|doing` tasks.
- Excludes tasks tagged `blocked` or `waiting`.
- Excludes category `Daily Repeat`.

### Score formula (current)
`final = priority_score + category_component + staleness_boost + tag_boost + subtask_boost - effort_penalty`

Where:
- `priority_score`: Critical 50, High 40, Medium 30, Low 20.
- `category_component`: `(base_category_weight + mode_adjustment) * 8`.
- `staleness_boost`: `(days_since_last_completion / 7) * 5`, capped at 3.
- `tag_boost`: quick-win +6, high-leverage +6, urgent +4.
- `subtask_boost`: +6 when `parent_task_id` exists.
- `effort_penalty`: `effort_hours / 2`, capped at 6.

### Queue slotting logic
- Slot 1: best quick-win (fallback top score if none).
- Slot 2: best high-leverage not already chosen.
- Slot 3: best remaining task (progress).
- Deterministic tie-break: task id ascending.

---

## 2) Proposed v3 model (Pareto + Eisenhower + Needs + Outcome alignment)

### Model intent
- Keep deterministic baseline behavior, but improve quality of metadata and strategic fit.
- Prefer additive updates and reversible rollout.

### v3 score shape
`v3 = impact_80_20 + urgency_importance + needs_alignment + north_star_alignment + execution_friction + confidence_adjustment`

Components:
1. **Pareto impact (80/20)**
   - Does this create disproportionate upside (revenue, risk reduction, bottleneck removal)?
2. **Eisenhower lens**
   - Importance and urgency are scored separately; avoid urgency-only bias.
3. **Human needs alignment**
   - Blend weekly `human_needs_weekly` trend to avoid burnout-driven over-optimization.
4. **Outcome alignment**
   - Alignment with `PROJECT_NORTH_STAR` outcomes and current operating mode.
5. **Execution friction**
   - Penalize large or ambiguous tasks; reward clear next action + bounded effort.
6. **Confidence adjustment**
   - Lower confidence when metadata is sparse; trigger enrichment first.

---

## 3) Parameter table (defaults + ranges)

| Parameter | Default | Range | Notes |
|---|---:|---:|---|
| max_tasks_per_enrichment_request | 25 | 1..25 | Cost + latency control |
| enrichment_ai_timeout_ms | 8000 | 3000..12000 | On timeout, fallback to heuristics |
| quick_win_minutes | 30 | 15..60 | Existing behavior remains |
| effort_buckets | XS,S,M,L | fixed | XS=15m, S=30m, M=90m, L=180m |
| due_soon_threshold_hours | 48 | 24..72 | Heuristic urgent signal |
| importance_weight | 1.0 | 0.5..2.0 | Eisenhower importance |
| urgency_weight | 0.8 | 0.3..1.5 | Eisenhower urgency |
| pareto_weight | 1.2 | 0.5..2.0 | Strategic leverage |
| needs_alignment_weight | 0.7 | 0.0..1.5 | Weekly sustainability |
| outcome_alignment_weight | 1.1 | 0.5..2.0 | North-star fit |
| friction_penalty_weight | 0.9 | 0.2..1.5 | Execution drag |

---

## 4) MVP implemented now: safe enrichment endpoint

### Endpoint
`POST /api/tasks/enrich-prioritization`

### Safety behavior
- Requires authenticated bearer token.
- Operates only on caller `user_id` rows.
- Default mode is dry-run (`apply=false` / `dry_run=true`).
- Apply requires explicit `apply=true`.
- Non-destructive updates:
  - only fills missing `priority` and missing `effort_hours`.
  - merges tags additively (never clears tags).
- Structured per-task report: `updated`, `skipped`, `errors`.

### Enrichment outputs
For tasks missing key prioritization metadata:
- `priority`
- `effort_bucket` (mapped to effort hours)
- tags (`quick-win|high-leverage|urgent|blocked|waiting`)
- optional `rationale`

### Reliability and cost controls
- Request cap: max 25 tasks.
- AI timeout: 8s.
- AI parse/timeout failures auto-fallback to deterministic heuristics.

### Optional UI hook added
- Backlog page now has:
  - `AI Enrich (dry run)`
  - `Apply enrichment`
- Includes summary line showing processed/updated/skipped/errors.

### Direct API usage (curl)
```bash
# DRY-RUN (default)
curl -s -X POST http://localhost:3000/api/tasks/enrich-prioritization \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -d '{"limit":25}' | jq

# APPLY
curl -s -X POST http://localhost:3000/api/tasks/enrich-prioritization \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -d '{"apply":true,"limit":25}' | jq
```

---

## 5) Rollout plan

1. **Phase 0 (now, shipped)**
   - Manual trigger only (Backlog buttons + API).
   - Dry-run default; apply requires explicit confirmation.
2. **Phase 1**
   - Observe report quality and false-positive tag rates.
   - Tune prompt + heuristic thresholds.
3. **Phase 2**
   - Introduce optional nightly dry-run preview (no auto-apply).
4. **Phase 3**
   - Feed enrichment confidence into v3 queue scoring.

Rollback: disable endpoint route usage and UI buttons; no schema migration required.

---

## 6) Verification plan

- Unit-style deterministic checks: `scripts/verify-task-enrichment.mjs`
- Existing safety nets still run:
  - `verify:scoring`, `verify:queue`, `verify:planner`
- Lint/build:
  - `npm run lint`
  - `npm run build`

Success criteria:
- Dry-run returns stable structured reports.
- Apply only updates missing fields.
- Existing task tags remain intact; only additive merges occur.
- Queue/planner behavior unchanged.

---

## 7) Canonical wording candidates

### `NEXT_ACTION_ALGO_V2` candidates
1. **"Pick the smallest high-impact move that reduces real risk or creates measurable progress today."**
2. **"Default to the next clear, finishable action with the strongest leverage-to-friction ratio."**
3. **"When uncertain, choose clarity first: one concrete action that unlocks downstream momentum."**

### `PROJECT_NORTH_STAR` candidates
1. **"Build a calm, compounding operating system where the right work is obvious and execution is low-friction."**
2. **"Maximize long-term outcome velocity by consistently shipping high-leverage actions without burning out."**
3. **"Turn strategic intent into daily execution quality through transparent priorities, fast feedback, and sustainable pace."**
