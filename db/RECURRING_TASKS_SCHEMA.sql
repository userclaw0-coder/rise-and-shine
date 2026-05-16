-- Recurring task primitive.
--
-- A template is a recipe; it spawns regular `tasks` rows when due.
-- Three recurrence types in v1:
--   1. interval  — N days after the LAST COMPLETION of the previous spawn
--                  (e.g., oil change every 180 days after I actually did it)
--   2. calendar  — small JSON DSL on a real calendar
--                  (e.g., 1st of every month; April 15 every year; Mon+Wed)
--   3. usage     — when a usage_counter advances by `usage_interval`
--                  (e.g., Tesla every 5000 mi; PPG service every 25 hours)
--
-- Spawn mechanics (no cron — all triggered lazily by MCP entry points):
--   * interval  → execCompleteTask sets next_spawn_at = now + interval_days.
--   * calendar  → next_spawn_at maintained at create/spawn time.
--   * usage     → execUpdateUsageCounter sets next_spawn_at = now() when the
--                 counter crosses threshold.
--   A single pass (spawnDueRecurringTemplates) runs at top of
--   execGetTodaysQueue / execGetBacklog / etc., and creates the actual tasks.
--
-- Missed-window policy (calendar): SKIP PAST MISSED. If you ignore March's
-- review and June's queue-read finally spawns, you get ONE task dated today,
-- not three stacked. Enforced by recomputing next_spawn_at from now() after
-- each spawn, not from the missed scheduled date.
--
-- Single-open-instance invariant: a template has at most one open
-- (status in 'todo','doing') task at a time. Enforced via partial unique
-- index on tasks.recurring_template_id.

begin;

-- 1) usage_counters: physical assets you track to drive usage-based tasks.
create table if not exists public.usage_counters (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  asset_label   text not null,        -- "Tesla 85D", "PPG engine"
  unit          text not null,        -- "miles", "hours", "cycles"
  current_value numeric not null default 0,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.usage_counters is
  'Physical asset usage counters (odometer mileage, engine hours, etc.).';
comment on column public.usage_counters.unit is
  'Free string; convention: miles | hours | cycles | km | nm.';

create index if not exists usage_counters_user_idx
  on public.usage_counters (user_id);

create or replace function public.usage_counters_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists usage_counters_updated_at on public.usage_counters;
create trigger usage_counters_updated_at
  before update on public.usage_counters
  for each row execute function public.usage_counters_set_updated_at();

alter table public.usage_counters enable row level security;

drop policy if exists usage_counters_select_own on public.usage_counters;
create policy usage_counters_select_own on public.usage_counters
  for select using (auth.uid() = user_id);
drop policy if exists usage_counters_insert_own on public.usage_counters;
create policy usage_counters_insert_own on public.usage_counters
  for insert with check (auth.uid() = user_id);
drop policy if exists usage_counters_update_own on public.usage_counters;
create policy usage_counters_update_own on public.usage_counters
  for update using (auth.uid() = user_id);
drop policy if exists usage_counters_delete_own on public.usage_counters;
create policy usage_counters_delete_own on public.usage_counters
  for delete using (auth.uid() = user_id);

-- 2) recurring_task_templates: the recipe.
create table if not exists public.recurring_task_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- copied to spawned tasks
  title         text not null,
  category_id   uuid references public.categories(id) on delete set null,
  subcategory_id uuid,
  priority      text not null default 'Medium'
                  check (priority in ('Critical','High','Medium','Low')),
  effort_hours  numeric,
  phase         text check (phase in
                  ('immediate','this_week','next_2w','next_30d',
                   'ongoing','blocked','someday')),
  notes         text,
  tags          jsonb not null default '[]'::jsonb,

  -- recurrence
  recurrence_type text not null check (recurrence_type in
                    ('interval','calendar','usage')),

  -- interval mode
  interval_days   integer check (interval_days is null or interval_days > 0),

  -- calendar mode: a small JSON DSL.
  --   {"every":"week","on_dow":[1,3]}        -- Mon, Wed (0=Sun..6=Sat)
  --   {"every":"month","on_day":1}           -- 1st of every month
  --   {"every":"year","on_month":4,"on_day":15}  -- April 15 every year
  calendar_rule   jsonb,

  -- usage mode
  usage_counter_id    uuid references public.usage_counters(id) on delete restrict,
  usage_interval      numeric check (usage_interval is null or usage_interval > 0),
  usage_at_last_spawn numeric,

  -- spawn state
  active                 boolean not null default true,
  next_spawn_at          timestamptz,
  last_spawned_at        timestamptz,
  last_completed_task_id uuid,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,

  -- Required fields per recurrence type.
  constraint recurring_template_fields_match_type check (
    case recurrence_type
      when 'interval' then interval_days is not null
      when 'calendar' then calendar_rule is not null
      when 'usage'    then usage_counter_id is not null
                         and usage_interval is not null
      else false
    end
  )
);

comment on table public.recurring_task_templates is
  'Recipe rows that spawn regular `tasks` when due. Three recurrence modes.';
comment on column public.recurring_task_templates.next_spawn_at is
  'When non-null and <= now(), spawnDueRecurringTemplates creates one task.';
comment on column public.recurring_task_templates.calendar_rule is
  'JSON DSL: {every:week,on_dow:[...]} | {every:month,on_day:N} | {every:year,on_month:N,on_day:N}.';

create index if not exists recurring_templates_user_idx
  on public.recurring_task_templates (user_id);
create index if not exists recurring_templates_due_idx
  on public.recurring_task_templates (user_id, next_spawn_at)
  where active = true and archived_at is null and next_spawn_at is not null;
create index if not exists recurring_templates_counter_idx
  on public.recurring_task_templates (usage_counter_id)
  where usage_counter_id is not null;

create or replace function public.recurring_templates_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists recurring_templates_updated_at on public.recurring_task_templates;
create trigger recurring_templates_updated_at
  before update on public.recurring_task_templates
  for each row execute function public.recurring_templates_set_updated_at();

alter table public.recurring_task_templates enable row level security;

drop policy if exists recurring_templates_select_own on public.recurring_task_templates;
create policy recurring_templates_select_own on public.recurring_task_templates
  for select using (auth.uid() = user_id);
drop policy if exists recurring_templates_insert_own on public.recurring_task_templates;
create policy recurring_templates_insert_own on public.recurring_task_templates
  for insert with check (auth.uid() = user_id);
drop policy if exists recurring_templates_update_own on public.recurring_task_templates;
create policy recurring_templates_update_own on public.recurring_task_templates
  for update using (auth.uid() = user_id);
drop policy if exists recurring_templates_delete_own on public.recurring_task_templates;
create policy recurring_templates_delete_own on public.recurring_task_templates
  for delete using (auth.uid() = user_id);

-- 3) tasks.recurring_template_id — back-reference on spawned instances.
alter table public.tasks
  add column if not exists recurring_template_id uuid
  references public.recurring_task_templates(id) on delete set null;

comment on column public.tasks.recurring_template_id is
  'Set when this task was spawned by a recurring template (vs. created ad hoc).';

create index if not exists tasks_recurring_template_idx
  on public.tasks (recurring_template_id)
  where recurring_template_id is not null;

-- Enforce: at most one OPEN (todo|doing) task per template at a time.
-- The spawn helper relies on this for idempotency.
create unique index if not exists tasks_one_open_per_template
  on public.tasks (recurring_template_id)
  where recurring_template_id is not null
    and status in ('todo','doing');

commit;

-- ROLLBACK:
-- begin;
--   drop index if exists public.tasks_one_open_per_template;
--   drop index if exists public.tasks_recurring_template_idx;
--   alter table public.tasks drop column if exists recurring_template_id;
--   drop trigger if exists recurring_templates_updated_at on public.recurring_task_templates;
--   drop function if exists public.recurring_templates_set_updated_at();
--   drop table if exists public.recurring_task_templates;
--   drop trigger if exists usage_counters_updated_at on public.usage_counters;
--   drop function if exists public.usage_counters_set_updated_at();
--   drop table if exists public.usage_counters;
-- commit;
