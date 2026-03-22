-- Optional: enable "last worked on" on Projects tiles (max of created_at/updated_at per task).
-- Safe to re-run. Skip if your `tasks` table already has `updated_at`.

alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

comment on column public.tasks.updated_at is 'Row update time; used for project activity hints.';

-- If you use Supabase-style set_updated_at trigger elsewhere, attach it to tasks:
-- create trigger trg_tasks_updated_at before update on public.tasks
-- for each row execute function public.set_updated_at();
