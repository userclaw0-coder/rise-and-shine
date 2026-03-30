# External AI Import Schema

Rise & Shine now supports a manual-first external AI project planning loop:

1. Export a project from `/category/[categoryId]`
2. Paste the bundle into Claude, Grok, or ChatGPT
3. Ask the model to return strict JSON using this schema
4. Paste that JSON back into the project workspace and preview/apply it

## Schema version

- `external_project_import_v1`

## Top-level shape

```json
{
  "meta": {
    "schema_version": "external_project_import_v1",
    "project_category_id": "uuid",
    "project_category_name": "Rental House",
    "source_model": "claude-sonnet-4",
    "prompt_version": "external_project_prompt_v1"
  },
  "summary": {
    "current_state": "Short diagnosis of where the project is now.",
    "strategy": "Short strategic plan for the next wave of progress.",
    "operator_notes": "Short practical notes for the human operator."
  },
  "workspace_patch": {},
  "task_actions": [],
  "alignment_actions": [],
  "vision_suggestions": []
}
```

## `workspace_patch`

Use this to propose edits to the per-project source of truth stored in `user_profile.preferences.project_workspaces[categoryId]`.

Supported fields:

```json
{
  "mantra": "One-line active intent",
  "narrative": "Updated strategic source of truth",
  "efficiency_tip": "Batching or execution recommendation",
  "suggested_moves": ["Concrete next move", "Another move"],
  "resources": [
    {
      "label": "County permit portal",
      "url": "https://example.com",
      "kind": "doc"
    }
  ],
  "health_needs": {
    "relationships": 70,
    "financial": 80,
    "wellbeing": 65,
    "growth": 72
  }
}
```

Notes:

- Omit fields you do not want to change.
- `resources.kind` must be one of `folder`, `doc`, `ai`, `archive`, or `other`.

## `task_actions`

Supported actions:

- `update_task`
- `create_root_task`
- `create_subtask`
- `archive_task`
- `deprioritize_task`

Example:

```json
[
  {
    "id": "task_update_1",
    "action": "update_task",
    "task_id": "existing-task-uuid",
    "title": "Tighten permit follow-up task",
    "summary": "Make the current task more concrete and time-bounded.",
    "task_patch": {
      "title": "Call county and confirm septic permit status",
      "priority": "High",
      "due_date": "2026-03-12",
      "effort_hours": 0.5,
      "outcome_ids": ["vision-0"],
      "primary_life_domain": "finances",
      "life_domains": ["finances"]
    },
    "tags_add": ["quick-win"]
  },
  {
    "id": "create_root_1",
    "action": "create_root_task",
    "title": "Add planning checkpoint",
    "summary": "Create a weekly review checkpoint for this project.",
    "create_task": {
      "title": "Review project blockers and next milestones",
      "priority": "Medium",
      "status": "todo",
      "effort_hours": 0.5,
      "tags": ["weekly-review"]
    }
  },
  {
    "id": "create_subtask_1",
    "action": "create_subtask",
    "parent_task_id": "existing-parent-task-uuid",
    "title": "Split the root task",
    "summary": "Turn the large task into a single next action.",
    "create_task": {
      "title": "Draft the vendor outreach email",
      "priority": "Medium",
      "status": "todo",
      "effort_hours": 0.5,
      "tags": ["quick-win"]
    }
  }
]
```

## `alignment_actions`

Use this when the task should stay the same structurally but needs stronger linkage to outcomes or human need strategies.

```json
[
  {
    "id": "align_1",
    "action": "align_task",
    "task_id": "existing-task-uuid",
    "title": "Align admin task to financial outcome",
    "summary": "This task supports the revenue and property outcome explicitly.",
    "alignment_patch": {
      "outcome_ids": ["vision-0"],
      "primary_life_domain": "finances",
      "life_domains": ["finances"],
      "rationale": "This directly supports the 12-month property objective."
    }
  }
]
```

## `vision_suggestions`

These are approval-based suggestions that can update vision data in a controlled way.

Supported actions:

- `add_desired_outcome`
- `update_desired_outcome`
- `add_quarter_focus`
- `add_strategy_note`

Example:

```json
[
  {
    "id": "vision_add_1",
    "action": "add_desired_outcome",
    "title": "Add milestone outcome",
    "summary": "Track permitting as its own success milestone.",
    "outcome": {
      "title": "Secure all required county approvals",
      "domain": "finances",
      "time_horizon": "12_months",
      "success_metric": "All permits approved",
      "priority_rank": 2
    }
  },
  {
    "id": "quarter_focus_add_1",
    "action": "add_quarter_focus",
    "title": "Promote this project into quarter focus",
    "summary": "This project is leverage-heavy enough to deserve explicit quarter focus.",
    "focus": "Rental House"
  }
]
```

## Guardrails

- Use only existing `task_id` values supplied in the export JSON when updating tasks.
- Use only existing `outcome_ids` when attaching tasks to outcomes.
- Prefer incremental, high-confidence changes over broad rewrites.
- Do not propose destructive deletion in v1.
- Return one JSON object only.
