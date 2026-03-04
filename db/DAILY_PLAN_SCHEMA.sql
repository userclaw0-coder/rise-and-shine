-- DAILY PLAN (Next 3 Actions Queue)
-- Stores a stable queue of 3 actions for a given date.
-- Refill policy: refill only when all 3 are completed (or user manually refreshes).

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  date date not null,
  mode text not null default 'Strategic Push', -- keep as text for flexibility

  -- queue stores exactly 3 slots; each slot has type + task_id
  -- Example:
  -- [
  --   {"slot":1,"type":"Quick Win","task_id":"uuid"},
  --   {"slot":2,"type":"High Leverage","task_id":"uuid"},
  --   {"slot":3,"type":"Progress","task_id":"uuid"}
  -- ]
  queue jsonb not null default '[]'::jsonb,

  refill_policy text not null default 'refill_when_all_done',
  refilled_count int not null default 0,

  last_refilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, date)
);

create index if not exists daily_plans_user_id_idx on public.daily_plans(user_id);
create index if not exists daily_plans_date_idx on public.daily_plans(date);

-- updated_at trigger
drop trigger if exists trg_daily_plans_updated_at on public.daily_plans;
create trigger trg_daily_plans_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.daily_plans enable row level security;

create policy "daily_plans_select_own"
on public.daily_plans
for select
using (auth.uid() = user_id);

create policy "daily_plans_insert_own"
on public.daily_plans
for insert
with check (auth.uid() = user_id);

create policy "daily_plans_update_own"
on public.daily_plans
for update
using (auth.uid() = user_id);

create policy "daily_plans_delete_own"
on public.daily_plans
for delete
using (auth.uid() = user_id);

-- Optional helper: validate queue structure (lightweight)
-- This doesn’t enforce JSON shape perfectly but can catch empties.
create or replace function public.daily_plans_queue_has_three_items(q jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(q) = 'array' and jsonb_array_length(q) = 3;
$$;

-- Optional check constraint: require 3 items once queue is set (allows empty during initial creation)
-- Uncomment if you want strict enforcement:
-- alter table public.daily_plans
-- add constraint daily_plans_queue_len_chk
-- check (queue = '[]'::jsonb or public.daily_plans_queue_has_three_items(queue));
