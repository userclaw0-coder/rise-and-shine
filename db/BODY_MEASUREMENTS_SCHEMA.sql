-- Body measurements log for the Health page.
--
-- Captures point-in-time body geometry (Navy tape method inputs + optional
-- limb girths) and computed body-fat percentage. Bodyweight stays in the
-- existing body_weight_logs table; this one is for tape-measure + estimate
-- snapshots taken on a slower cadence (every few weeks).
--
-- Navy tape method (men) requires: neck_in, waist_in, height_in.
--   bodyfat_pct = 86.01 * log10(waist - neck) - 70.041 * log10(height) + 36.76
-- bf_method defaults to 'navy' so future methods (e.g., DEXA, bioimpedance)
-- can be distinguished without a schema change.
--
-- NOTE: this DDL was applied directly to the live Supabase project via the
-- management API before this file existed in the repo. It is recorded here
-- so the repo's schema history matches production. Safe to re-run against
-- prod (idempotent via IF NOT EXISTS / DO blocks for policies).

begin;

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  measured_at timestamptz not null default now(),
  height_in numeric,
  neck_in numeric,
  waist_in numeric,
  hip_in numeric,
  chest_in numeric,
  shoulders_in numeric,
  upper_arm_in numeric,
  forearm_in numeric,
  thigh_in numeric,
  calf_in numeric,
  bodyfat_pct numeric,
  bf_method text default 'navy',
  note text
);

alter table public.body_measurements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='body_measurements' and policyname='body_measurements_select_own') then
    create policy body_measurements_select_own on public.body_measurements
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='body_measurements' and policyname='body_measurements_insert_own') then
    create policy body_measurements_insert_own on public.body_measurements
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='body_measurements' and policyname='body_measurements_update_own') then
    create policy body_measurements_update_own on public.body_measurements
      for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='body_measurements' and policyname='body_measurements_delete_own') then
    create policy body_measurements_delete_own on public.body_measurements
      for delete using (auth.uid() = user_id);
  end if;
end$$;

create index if not exists body_measurements_user_measured_idx
  on public.body_measurements (user_id, measured_at desc);

-- New column on lifting_sessions so the sticky A/B next-workout card can tag
-- which session was logged (rather than inferring from exercise names).
alter table public.lifting_sessions add column if not exists workout_label text;

commit;

-- ROLLBACK (manual; not run automatically):
-- begin;
--   alter table public.lifting_sessions drop column if exists workout_label;
--   drop index if exists public.body_measurements_user_measured_idx;
--   drop table if exists public.body_measurements;
-- commit;
