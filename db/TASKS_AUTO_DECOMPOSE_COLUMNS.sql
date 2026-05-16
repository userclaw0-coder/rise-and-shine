-- Adds two flags to tasks to support the pre-compute auto-decompose
-- pipeline.
--
--   auto_decomposed  set true when the system has run a decomposition pass
--                    on this task (created subtask children) — used to make
--                    the pipeline idempotent and to know what's safe to
--                    rewrite later.
--   is_terminal      set true on bottomed-out time-box subtasks created
--                    when a parent is physically irreducible (e.g. "Do 30
--                    min on Install motor mount"). Terminal subtasks are
--                    never themselves decomposed; they stay surfaced until
--                    the user completes the parent.
--
-- Safe to re-run.

begin;

alter table public.tasks
  add column if not exists auto_decomposed boolean not null default false,
  add column if not exists is_terminal     boolean not null default false;

comment on column public.tasks.auto_decomposed is
  'True if the system auto-decompose pipeline has run on this task (children created).';
comment on column public.tasks.is_terminal is
  'True if this is a bottomed-out time-box subtask ("Do 30 min on X") that should not be further decomposed.';

commit;

-- Rollback:
-- alter table public.tasks drop column if exists auto_decomposed;
-- alter table public.tasks drop column if exists is_terminal;
