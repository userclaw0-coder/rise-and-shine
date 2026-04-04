
# DATA_MODEL.md
Rise & Shine – Data Model (V3)

This document defines the canonical data structures used by the planner, UI, analytics, and automations.
It assumes a Supabase/Postgres backend, but the model is portable to local-first storage.

---

## Design Goals
- **Single source of truth**: a small number of core entities, each with clear ownership.
- **Auditability**: decisions and completions are tracked as events (no guessing).
- **Local + Cloud support**: model can be stored in Postgres or in local JSON/SQLite later.
- **Approval-based automation**: automation proposals are separate from execution.

---

## Core Entities (Conceptual)

### 1) User Profile
Represents the user's high-level identity, vision, constraints, and preferences.

```json
{
  "user_id": "uuid",
  "identity_attributes": ["Calm operator", "Builder", "Present father"],
  "life_domains": {
    "business": "Build profitable automated ventures",
    "finances": "Zero debt and strong cashflow",
    "health": "Lean, strong, and metabolically fit",
    "relationships": "Present, connected, consistent",
    "lifestyle": "Freedom, adventure, time outdoors",
    "growth": "Continuous learning and skill building"
  },
  "desired_outcomes": [
    {
      "id": "uuid",
      "title": "Build rental house on property",
      "domain": "finances",
      "time_horizon": "12_months",
      "success_metric": "CO issued + move-in ready",
      "priority_rank": 1
    }
  ],
  "quarter_focus": ["Business", "Rental House", "Health"],
  "resources": ["Supportive spouse", "Coding tools", "Time 5–7am"],
  "constraints": ["Kids schedule", "Limited deep work mid-day"],
  "available_hours_per_week": 12,
  "energy_profile": {
    "best_time_of_day": "morning",
    "low_energy_times": ["late_evening"],
    "notes": "High cognitive + physical ok on strength and sprint days"
  },
  "preferences": {
    "base_category_weights": {
      "Business": 5,
      "Rental House": 4,
      "Vehicles": 3,
      "Home": 2,
      "Boat": 1,
      "Personal": 2
    },
    "quick_win_definition_minutes": 30,
    "default_mode": "Strategic Push"
  },
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

Storage:
- `user_profile` table (1 row per user), or JSONB column keyed by user_id.

---

### 2) Human Needs (Weekly Snapshots)
Tony Robbins Six Human Needs tracked weekly. Used as a subtle balancing signal.

```json
{
  "user_id": "uuid",
  "week_start": "YYYY-MM-DD",
  "scores": {
    "certainty": 6,
    "variety": 7,
    "significance": 6,
    "connection": 8,
    "growth": 7,
    "contribution": 5
  },
  "healthy_strategies": {
    "certainty": ["Weekly planning", "Emergency fund plan"],
    "variety": ["Adventure day", "Rotate projects"],
    "significance": ["Ship something weekly"],
    "connection": ["1:1 time with spouse", "Family dinner"],
    "growth": ["Skill ladder", "Training blocks"],
    "contribution": ["Help someone weekly"]
  },
  "risk_patterns": ["doomscrolling", "overworking"],
  "notes": "Certainty slightly low; emphasize financial/admin stabilization tasks this week.",
  "created_at": "timestamp"
}
```

Storage:
- `human_needs_weekly` table keyed by (user_id, week_start).

Planner usage:
- Convert deficit into a **small weighting boost** toward tasks that address that need.
- Never override urgent safety issues or critical constraints.

---

### 3) Tasks
Tasks are atomic units of work. Subtasks are tasks with `parent_task_id`.

Core task structure:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Call county about septic permit status",
  "category": "Rental House",
  "subcategory": "Permits",
  "priority": "High",
  "effort_hours": 0.5,
  "due_date": "YYYY-MM-DD|null",
  "status": "todo|doing|done|archived",
  "parent_task_id": "uuid|null",
  "tags": ["urgent", "high-leverage"],
  "outcome_ids": ["vision-0", "vision-1"],
  "primary_life_domain": "finances",
  "life_domains": ["finances", "business"],
  "alignment_source": "user|ai|null",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "archived_at": "timestamp|null"
}
```

Notes:
- **Archive instead of delete** to preserve analytics and audit history.
- Tags are many-to-many in DB; represented as list in API.
- **Outcome/domain alignment:** `outcome_ids` reference `user_profile.profile.desired_outcomes[].id` (e.g. `vision-0`). `primary_life_domain` and `life_domains` use the stored vision keys (business, finances, health, relationships, lifestyle, growth), which now display in the app as Human Need Strategies. `alignment_source` indicates who set the mapping (`user`, `ai`, or unset). Used for analytics: distribution of completed effort by outcome and human need strategy.

---

### 4) Task Events (Audit Log)
All important actions become events:
- completed/uncompleted
- archived/restored
- edits
- tag changes
- moves/reorders

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "task_id": "uuid",
  "event_type": "completed|uncompleted|archived|restored|updated|tag_added|tag_removed|moved",
  "value": { "from": "...", "to": "..." },
  "created_at": "timestamp"
}
```

This powers:
- “completed tasks by date/time”
- streaks
- velocity
- time-of-day patterns

---

### 5) Daily Templates (Routines)
Templates define a repeatable daily routine with ordering.

```json
{
  "template": {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Standard",
    "is_default": true
  },
  "items": [
    { "id": "uuid", "task_id": "uuid", "sort_order": 0 },
    { "id": "uuid", "task_id": "uuid", "sort_order": 1 }
  ]
}
```

Ordering:
- stored by `sort_order`
- drag/drop updates sort_order

---

### 6) Daily Plan (Next 3 Actions “Queue”)
To support your behavior preference:
- Show “Next 3 actions”
- When all 3 are completed, refill with next 3
- Not constantly backfilling mid-stream

We store an explicit daily queue to keep the three stable until finished.

```json
{
  "user_id": "uuid",
  "date": "YYYY-MM-DD",
  "mode": "Strategic Push|...",
  "queue": [
    { "slot": 1, "type": "Quick Win", "task_id": "uuid" },
    { "slot": 2, "type": "High Leverage", "task_id": "uuid" },
    { "slot": 3, "type": "Progress", "task_id": "uuid" }
  ],
  "refill_policy": "refill_when_all_done",
  "refilled_count": 0,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

Storage:
- `daily_plans` table with JSONB queue.

Rules:
- Only refill when all queue items are done.
- Provide “Refresh queue” button (manual override).

---

### 7) Notes
Daily notes and optional task notes.

```json
{ "user_id":"uuid", "date":"YYYY-MM-DD", "note":"text" }
```

---

### 8) Ideas Inbox
Ideas can be promoted to tasks.

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Idea: AI onboarding service for small biz",
  "details": "…",
  "status": "new|triage|active|archived",
  "tags": ["business", "automation"],
  "created_at": "timestamp"
}
```

---

### 9) Health Tracking
Body weight logs:

```json
{ "user_id":"uuid", "weight": 182.4, "unit":"lb", "measured_at":"timestamp" }
```

Lifting:
- `lifting_sessions` + `lifting_sets` (sets-based).

---

## API Shapes (Recommended)
- `GET /api/today` returns: template items + daily plan queue + workout task + metrics.
- `POST /api/plan/refill` refills the queue if all 3 done.
- `POST /api/check` creates task_event completed/uncompleted with timestamp.
- `GET /api/analytics` returns computed metrics.

---

## Migration Considerations
When migrating from local JSON:
- tasks.json → tasks
- log.jsonl → task_events (created_at from ts)
- state.json → daily_plans + notes (if present)

---
