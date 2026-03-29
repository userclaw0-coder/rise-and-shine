-- Shared projects, memberships, task assignments, and actor-aware task events.
-- Safe to re-run when possible.

create table if not exists public.project_memberships (
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_by uuid references auth.users(id) on delete set null,
  email_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, user_id)
);

create index if not exists idx_project_memberships_user
  on public.project_memberships (user_id, role);

create table if not exists public.shared_project_workspaces (
  category_id uuid primary key references public.categories(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace jsonb not null default '{}'::jsonb,
  legacy_links text not null default '',
  task_order_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_project_workspaces_owner
  on public.shared_project_workspaces (owner_user_id);

create table if not exists public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  email_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists idx_task_assignments_user
  on public.task_assignments (user_id);

alter table public.task_events
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

comment on table public.project_memberships is 'Project/category sharing memberships.';
comment on table public.shared_project_workspaces is 'Shared workspace state for a category/project.';
comment on table public.task_assignments is 'Explicit assignees for shared project tasks.';
comment on column public.task_events.actor_user_id is 'Actor who performed the event when different from task owner.';

insert into public.project_memberships (category_id, user_id, role, added_by)
select c.id, c.user_id, 'owner', c.user_id
from public.categories c
where not exists (
  select 1
  from public.project_memberships pm
  where pm.category_id = c.id
    and pm.user_id = c.user_id
);
