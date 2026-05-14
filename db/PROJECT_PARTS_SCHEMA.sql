-- Project Parts inventory — physical hardware tracked per project.
--
-- Schema design notes:
-- * Scoped to a project via `category_id` (matches how tasks/notes/KB scope).
-- * Lifecycle status is enum-ish text with a CHECK constraint (matches the
--   "USER-DEFINED" enum style used elsewhere is heavier; CHECK is enough here).
-- * `location` reuses the @home / @longterm / @workyard / @boat vocabulary
--   already used on task tags. Not a FK — it's a free string with hinted values.
-- * `workstream` reuses the EL/CH/HU/SY/SR/CO/LR/AI taxonomy. Also free string.
-- * `spec` is jsonb so each part type can carry its own structured fields
--   (voltage, capacity_ah, wattage_w, fuse_a, dimensions, etc.) without
--   schema migrations per part class.
-- * `photos` reserved as jsonb for future Supabase Storage URLs; v1 is empty.
-- * `task_parts` link table connects tasks to parts so completing an "install
--   the inverter" task can flip the part's status to `installed`.
-- * RLS: owner-only, matches the pattern on tasks/memories/categories.

begin;

create table if not exists public.project_parts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,

  name          text not null,
  part_number   text,
  manufacturer  text,
  qty           integer not null default 1 check (qty >= 0),

  status        text not null default 'on_hand' check (status in
                  ('on_hand','installed','ordered','planned','missing','retired')),
  location      text,
  workstream    text,

  spec          jsonb not null default '{}'::jsonb,
  notes         text,
  photos        jsonb not null default '[]'::jsonb,

  source_ref    text,

  ordered_at    timestamptz,
  installed_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.project_parts is
  'Physical hardware inventory scoped to a project (category).';
comment on column public.project_parts.status is
  'on_hand | installed | ordered | planned | missing | retired';
comment on column public.project_parts.location is
  'Free string; convention follows @home / @longterm / @workyard / @boat task-tag vocab.';
comment on column public.project_parts.workstream is
  'Free string; convention follows EL / CH / HU / SY / SR / CO / LR / AI task-tag vocab.';
comment on column public.project_parts.spec is
  'Flexible structured spec (voltage, capacity_ah, wattage_w, fuse_a, etc.).';
comment on column public.project_parts.photos is
  'Reserved for Supabase Storage URLs [{url, caption, uploaded_at}]; empty in v1.';
comment on column public.project_parts.source_ref is
  'Provenance pointer back to a note / memory / task that introduced this part.';

create index if not exists project_parts_user_category_idx
  on public.project_parts (user_id, category_id);
create index if not exists project_parts_user_status_idx
  on public.project_parts (user_id, status);
create index if not exists project_parts_user_workstream_idx
  on public.project_parts (user_id, workstream)
  where workstream is not null;

-- Auto-maintain updated_at on row update.
create or replace function public.project_parts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_parts_updated_at on public.project_parts;
create trigger project_parts_updated_at
  before update on public.project_parts
  for each row execute function public.project_parts_set_updated_at();

-- RLS: owner-only.
alter table public.project_parts enable row level security;

drop policy if exists project_parts_select_own on public.project_parts;
create policy project_parts_select_own on public.project_parts
  for select using (auth.uid() = user_id);

drop policy if exists project_parts_insert_own on public.project_parts;
create policy project_parts_insert_own on public.project_parts
  for insert with check (auth.uid() = user_id);

drop policy if exists project_parts_update_own on public.project_parts;
create policy project_parts_update_own on public.project_parts
  for update using (auth.uid() = user_id);

drop policy if exists project_parts_delete_own on public.project_parts;
create policy project_parts_delete_own on public.project_parts
  for delete using (auth.uid() = user_id);

-- task_parts: link tasks to the parts they install / consume / configure.
create table if not exists public.task_parts (
  task_id     uuid not null references public.tasks(id) on delete cascade,
  part_id     uuid not null references public.project_parts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'installs' check (role in
                ('installs','consumes','configures','references')),
  created_at  timestamptz not null default now(),
  primary key (task_id, part_id)
);

comment on table public.task_parts is
  'Many-to-many link between tasks and physical parts.';
comment on column public.task_parts.role is
  'installs | consumes | configures | references';

create index if not exists task_parts_user_part_idx
  on public.task_parts (user_id, part_id);
create index if not exists task_parts_user_task_idx
  on public.task_parts (user_id, task_id);

alter table public.task_parts enable row level security;

drop policy if exists task_parts_select_own on public.task_parts;
create policy task_parts_select_own on public.task_parts
  for select using (auth.uid() = user_id);

drop policy if exists task_parts_insert_own on public.task_parts;
create policy task_parts_insert_own on public.task_parts
  for insert with check (auth.uid() = user_id);

drop policy if exists task_parts_update_own on public.task_parts;
create policy task_parts_update_own on public.task_parts
  for update using (auth.uid() = user_id);

drop policy if exists task_parts_delete_own on public.task_parts;
create policy task_parts_delete_own on public.task_parts
  for delete using (auth.uid() = user_id);

commit;

-- ROLLBACK:
-- begin;
--   drop table if exists public.task_parts;
--   drop trigger if exists project_parts_updated_at on public.project_parts;
--   drop function if exists public.project_parts_set_updated_at();
--   drop table if exists public.project_parts;
-- commit;
