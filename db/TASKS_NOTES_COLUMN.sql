-- Adds tasks.notes: free-text markdown notes / rich procedural content per task.
--
-- Captured 2026-05-15 to support Tom's working-style preference: when creating
-- tasks for physical / hands-on work, useful step-by-step links and detailed
-- guidance should be embedded in or directly referenced from the task — info
-- needs to be at hand on the workbench, not buried in conversation scrollback.
-- Prior to this column, the workaround was to put rich content in the project
-- knowledge_base (markdown) and reference the KB section by name in the task
-- title. This column makes that content first-class on the task itself.
--
-- Migration applied via Supabase MCP `apply_migration` on 2026-05-15 with name
-- `tasks_notes_column`. This file is the source-controlled mirror.

begin;

alter table public.tasks
  add column if not exists notes text;

comment on column public.tasks.notes is
  'Free-text markdown notes / rich procedural content per task. Used for embedded step-by-step links, procedure details, URLs, and reference content that should live alongside the task.';

commit;

-- Rollback:
-- alter table public.tasks drop column if exists notes;
