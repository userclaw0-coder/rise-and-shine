# Schema alignment (docs/supabase_schema_columns.csv)

This doc records how the app maps to the Supabase schema.

## daily_notes
- **Columns used:** `date`, `note` (not `note_date`/`content`). Upsert conflict: `user_id`, `date`.
- **lib/db.js:** `getDailyNotes`, `getDailyNoteForDate`, `upsertDailyNote`.
- **pages/notes.js:** State and UI use `date`, `note`; list shows `n.date`, `n.note`.

## body_weight_logs
- **Columns used:** `weight`, `unit` (default `'lb'`), `measured_at` (timestamptz). No `log_date`; date is derived from `measured_at`.
- **lib/db.js:** `getBodyWeightLogs` selects `weight`, `unit`, `measured_at`, `note`; orders by `measured_at`. `insertBodyWeightLog(userId, dateStr, weightValue, unit)` sets `measured_at` to noon UTC on that date.
- **pages/health.js:** Chart uses `measured_at` (sliced to date) and `weight`; form submits `weight` and optional unit.

## lifting_sets
- **Columns used:** `exercise`, `weight`, `reps`, `set_number`; `user_id` required on insert.
- **lib/db.js:** `getLiftingSets` selects `exercise`, `weight`; `addLiftingSet(userId, sessionId, payload)` maps `payload.exercise_name`/`payload.exercise` → `exercise`, `payload.weight_kg`/`payload.weight` → `weight`.
- **pages/health.js:** Displays `set.exercise`, `set.weight`; form passes `exercise_name`/`weight_kg` for compatibility.

## task_events
- **Columns used:** `value` (jsonb), not `metadata`.
- **lib/db.js:** All inserts/selects use `value`. Workout completion uses a single "Workout (daily)" task and `value: { date: "YYYY-MM-DD" }`; see `getOrCreateWorkoutTaskId`.
- **pages/today.js:** Builds completion map from `ev.value?.date` for the workout task so synthetic key `workout-${date}` works.

## tasks
- **Schema:** `category_id` is NOT NULL. Outcome/domain alignment: `outcome_ids` (text[]), `primary_life_domain` (text), `life_domains` (text[]), `alignment_source` (text). See `db/TASKS_OUTCOME_DOMAIN_COLUMNS.sql`.
- **lib/db.js:** `createTask` resolves a default category (first category for user) when `category_id` is null; accepts `outcome_ids`, `primary_life_domain`, `life_domains`, `alignment_source`. `updateTask` allows the same alignment fields. `getBacklogTasks` and `getLastCompletedEventsWithTasks` (task relation) select them. `promoteIdeaToTask` uses Business category or first category.

## tags
- **Schema:** `name`, `color`; no `slug`.
- **lib/db.js:** `getAllTags` selects `id`, `name`, `color`. `setTaskTags` finds or creates tags by `user_id` + `name` (no slug/upsert on slug).

## ideas
- **Schema:** `status` has default `'new'` (type `idea_status`).
- **lib/db.js:** `createIdea` uses `status: payload.status || "new"`. Promote sets `status: "promoted"` (must exist in enum).

## daily_template_items
- **Schema:** `user_id` NOT NULL.
- **lib/db.js:** `addTemplateItem(userId, templateId, taskId)` includes `user_id` in insert.
- **pages/templates.js:** Calls `addTemplateItem(user.id, activeTemplateId, addTaskId)`.
