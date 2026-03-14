-- Optional: create notes table for multi-note per day (optional title, timestamped).
-- Run in Supabase SQL editor if using the new Notes page (multiple notes per day with title).
-- RLS: user can only access their own rows.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists notes_user_id_created_at on public.notes(user_id, created_at desc);

alter table public.notes enable row level security;

drop policy if exists notes_select_own on public.notes;
create policy notes_select_own on public.notes for select using (auth.uid() = user_id);
drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes for insert with check (auth.uid() = user_id);
drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes for update using (auth.uid() = user_id);
drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own on public.notes for delete using (auth.uid() = user_id);
