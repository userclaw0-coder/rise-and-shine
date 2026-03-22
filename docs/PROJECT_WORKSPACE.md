# Strategic project workspace (per category)

Each **Action Items category** has a dedicated page at **`/category/[categoryId]`** — a “project” environment aligned with your vision/outcomes and external AI workflows.

## Stored data (`user_profile.preferences`)

- **`project_workspaces[categoryId]`**
  - `mantra` — one-line active intent
  - `narrative` — long-form source of truth for humans + AI
  - `efficiency_tip` — batching / efficiency note (AI or user)
  - `suggested_moves` — string[] of next moves / subtask ideas
  - `resources` — `{ id, label, url, kind }[]` (`kind`: folder, doc, ai, archive, other)
  - `health_needs` — self-reported sliders: `relationships`, `financial`, `wellbeing`, `growth` (0–100)
- **`category_project_links[categoryId]`** — legacy freeform textarea (still saved; appended to AI context pack when present)
- **`category_task_order_ids[categoryId]`** — optional ordering (loaded for consistency; main sort on workspace is user-chosen score/due/title)

## Features

- **Alignment %** — heuristic from mantra/narrative depth + root-task completion + outcome linkage (not a scientific metric; nudges completeness).
- **Copy context for AI** — Markdown bundle: mantra, narrative, vision outcomes, health sliders, resources, tasks, legacy links.
- **Action items** — same **BacklogStrategicTaskCard** as Action Items (inline edit, subtasks, outcomes, domains).

## Future improvements

- Server-side **project-scoped AI** endpoint (generate `suggested_moves` / subtasks from narrative + tasks).
- **Attachments** table or Supabase Storage for files.
- **Per-project “pinned” notes** synced with `/notes`.
- **Cross-project graph**: urgency vs importance matrix using existing task scores.
