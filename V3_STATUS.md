# V3 Dashboard — Current Structure & Gaps

## Current structure

- **Pages (Pages Router):** `/` (index), `/login`, `/today`, `/backlog`, `/templates`, `/analytics`, `/notes`, `/ideas`, `/health`
- **Layout:** `components/DashboardLayout.js` — nav (Today, Backlog, Templates, Analytics, Notes, Ideas, Health) + sign out; used by all dashboard pages
- **Auth:** Each page checks Supabase Auth and redirects to `/login` if unauthenticated
- **Data layer:** `lib/db.js` (templates, template items, tasks, task_events, categories, tags, task CRUD, setTaskTags), `lib/supabaseClient.js`
- **Scoring:** `lib/scoring.js` — mode weights, workout cycle, key-outcome scoring (currently different formula from SCORING_MODEL.md)

## Implemented

- **Today:** Default daily template, ordered items, completion via task_events (no status change), workout block (synthetic `workout-YYYY-MM-DD`), 3 key outcomes with scoring and “Explain why” breakdown, mode selector, Refresh outcomes
- **Backlog:** Filters (search, status, category, subcategory, tag), inline edit (title, category, subcategory, priority, effort, due, tags), archive/restore + task_events, nested subtasks (collapsible), Add Task, Add Subtask
- **Templates:** List templates, set default, drag/drop reorder items (sort_order persisted)

## Completed in this pass

1. **Scoring** — Aligned with SCORING_MODEL.md: priority 50/40/30/20, category×8, tag boosts +6/+6/+4, subtask +6, effort_penalty (effort/2 max 6), staleness (days/7×5 max 3). Outcome slots: 1 Quick Win, 1 High Leverage, 1 Progress Task.
2. **Templates** — Add/remove daily repeat tasks (dropdown of tasks not in template, Remove button per item).
3. **Notes** — `daily_notes`: list by date desc, edit and save note for today.
4. **Ideas** — Create (title/details), list with status, “Promote to Task” → Business task + event.
5. **Health** — Body weight log + line chart; lifting sessions + sets (exercise, weight, reps, set#).
6. **Analytics** — 7-day and 30-day momentum (bar charts), time-of-day histogram, “Completed tasks with timestamps” table (last 50).
7. **Index** — Redirect to `/today` after bootstrap.

## Schema reference (Supabase)

Tables: categories, subcategories, tags, tasks, task_tags, task_events, daily_templates, daily_template_items, daily_notes, ideas, body_weight_logs, lifting_sessions, lifting_sets.
