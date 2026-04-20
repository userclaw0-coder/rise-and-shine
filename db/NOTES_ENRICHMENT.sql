-- Notes enrichment: pinned + jarvis_feed flags, updated_at, and a
-- note_tags join table mirroring the task_tags pattern.
-- Safe to re-run.

alter table public.notes
  add column if not exists pinned boolean not null default false,
  add column if not exists jarvis_feed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists notes_user_pinned
  on public.notes(user_id, pinned) where pinned = true;
create index if not exists notes_user_jarvis
  on public.notes(user_id, jarvis_feed) where jarvis_feed = true;

create table if not exists public.note_tags (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id  uuid not null references public.tags(id)  on delete cascade,
  user_id uuid not null references auth.users(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create index if not exists note_tags_user_note on public.note_tags(user_id, note_id);
create index if not exists note_tags_tag       on public.note_tags(tag_id);

alter table public.note_tags enable row level security;

drop policy if exists note_tags_all_own on public.note_tags;
create policy note_tags_all_own on public.note_tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
