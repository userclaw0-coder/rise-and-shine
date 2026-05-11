-- Adds tasks.phase: the user-committed time-window bucket assigned during
-- a Reorient pass. Replaces the implicit "this week active / ordered backlog
-- / needs breakdown" grouping with explicit user-chosen phases that match
-- the language already used in workspace.suggested_moves.
--
-- Phase taxonomy (locked 2026-05-11):
--   immediate  | do this today / next 24h
--   this_week  | within 7 days
--   next_2w    | 8-14 days out
--   next_30d   | this month
--   ongoing    | recurring / maintenance
--   blocked    | waiting on something external
--   someday    | maybe, parked
--   NULL       | not yet triaged
--
-- Phases are populated during the per-project Reorient wizard. The
-- category page renders them as chips on the task ladder.

begin;

alter table public.tasks
  add column if not exists phase text
  check (phase is null or phase in
    ('immediate','this_week','next_2w','next_30d','ongoing','blocked','someday'));

comment on column public.tasks.phase is
  'User-committed time-window bucket from the Reorient flow. Null = not yet triaged.';

create index if not exists tasks_phase_idx
  on public.tasks (user_id, category_id, phase)
  where archived_at is null and phase is not null;

commit;

-- Rollback:
-- alter table public.tasks drop column if exists phase;
