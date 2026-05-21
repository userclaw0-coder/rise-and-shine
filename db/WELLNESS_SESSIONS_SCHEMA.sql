-- Wellness sessions: non-strength activity log (yoga, mobility, walks, hikes…).
--
-- The lifting tables track weight × reps, which doesn't fit timed/partner-based
-- activities like yoga. This table captures presence + duration + an optional
-- partner so the Health calendar can dot those days and a simple
-- sessions-per-week chart can trend frequency over time.
--
-- `kind` is freeform text (no enum) so new activity types can be added without
-- a migration. Convention: lowercase singular — 'yoga', 'walk', 'hike',
-- 'mobility'.

begin;

create table if not exists public.wellness_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_date date not null default current_date,
  kind text not null,
  duration_min numeric,
  partner text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.wellness_sessions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wellness_sessions' and policyname='wellness_sessions_select_own') then
    create policy wellness_sessions_select_own on public.wellness_sessions
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wellness_sessions' and policyname='wellness_sessions_insert_own') then
    create policy wellness_sessions_insert_own on public.wellness_sessions
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wellness_sessions' and policyname='wellness_sessions_update_own') then
    create policy wellness_sessions_update_own on public.wellness_sessions
      for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wellness_sessions' and policyname='wellness_sessions_delete_own') then
    create policy wellness_sessions_delete_own on public.wellness_sessions
      for delete using (auth.uid() = user_id);
  end if;
end$$;

create index if not exists wellness_sessions_user_date_idx
  on public.wellness_sessions (user_id, session_date desc);

commit;

-- ROLLBACK (manual; not run automatically):
-- begin;
--   drop index if exists public.wellness_sessions_user_date_idx;
--   drop table if exists public.wellness_sessions;
-- commit;
