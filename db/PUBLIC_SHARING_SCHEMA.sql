-- Public sharing: let users toggle their rise-and-shine data to read-only public.
-- Adds is_public column to user_profile and RLS policies allowing anon reads
-- of tasks / daily_plans / user_profile rows belonging to users who opted in.
-- Safe to re-run.

alter table public.user_profile
  add column if not exists is_public boolean not null default false;

create index if not exists idx_user_profile_is_public
  on public.user_profile (is_public)
  where is_public = true;

-- Allow anyone (including anon) to read a user_profile row marked public.
drop policy if exists "user_profile_select_public" on public.user_profile;
create policy "user_profile_select_public"
on public.user_profile
for select
to anon, authenticated
using (is_public = true);

-- Allow anyone to read tasks belonging to a user whose profile is public.
drop policy if exists "tasks_select_public" on public.tasks;
create policy "tasks_select_public"
on public.tasks
for select
to anon, authenticated
using (
  exists (
    select 1 from public.user_profile up
    where up.user_id = tasks.user_id
      and up.is_public = true
  )
);

-- Allow anyone to read today's daily plan for a public user.
drop policy if exists "daily_plans_select_public" on public.daily_plans;
create policy "daily_plans_select_public"
on public.daily_plans
for select
to anon, authenticated
using (
  exists (
    select 1 from public.user_profile up
    where up.user_id = daily_plans.user_id
      and up.is_public = true
  )
);

comment on column public.user_profile.is_public is
  'When true, this user''s profile and tasks are readable by anonymous visitors via /share/[userId].';
