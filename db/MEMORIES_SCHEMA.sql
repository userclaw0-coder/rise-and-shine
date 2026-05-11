-- Memories table — the warm-tier memory store for the Jarvis memory layer.
--
-- Schema design notes:
-- * Atomic memory notes (Mem0 / A-MEM / Generative-Agents pattern). Each row
--   is one self-contained fact / decision / observation, scoped to a target
--   (global, outcome, project, task, or person).
-- * `embedding` is vector(1024) to match local mxbai-embed-large (and Voyage
--   voyage-3-large if we ever swap providers). If you change embedding model
--   to one with different dimensions, you'll need a column migration.
-- * `superseded_by` lets weekly consolidation merge duplicates without
--   destructive deletes.
-- * `archived_at` is for soft-archive after decay; cold-archive is still
--   queryable by tools that need history.
-- * Per-tier retrieval lives in lib/memories.js, not as a generated column,
--   so the formula can evolve without a schema change.

begin;

-- pgvector extension. Supabase has it available at 0.8.0; enable into public.
create extension if not exists vector with schema public;

create table if not exists public.memories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  scope_type    text not null check (scope_type in
                  ('global','outcome','project','task','person')),
  scope_id      text,
  kind          text not null check (kind in
                  ('fact','decision','preference','relationship',
                   'constraint','observation','commitment')),
  content       text not null,
  importance    smallint not null default 5 check (importance between 1 and 10),
  confidence    numeric(3,2) not null default 0.80
                  check (confidence between 0 and 1),
  source        text not null check (source in
                  ('chat','reflection','user','document','task_event','reorient','seed')),
  source_ref    text,
  embedding     vector(1024),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  use_count     int not null default 0,
  superseded_by uuid references public.memories(id) on delete set null,
  archived_at   timestamptz
);

comment on table public.memories is
  'Warm-tier memory store: atomic facts/decisions/observations with embedding-based retrieval.';
comment on column public.memories.scope_type is
  'Retrieval scope: global, outcome, project (category_id), task (task_id), person (name/email).';
comment on column public.memories.kind is
  'fact | decision | preference | relationship | constraint | observation | commitment';
comment on column public.memories.source is
  'How this memory entered the store. Drives confidence and decay behavior.';
comment on column public.memories.superseded_by is
  'Points at the consolidation winner when this memory was merged into another.';

-- Owner-scoped indexes for read patterns: by scope, by kind, by importance/recency.
create index if not exists memories_user_scope_idx
  on public.memories (user_id, scope_type, scope_id)
  where archived_at is null;
create index if not exists memories_user_kind_idx
  on public.memories (user_id, kind)
  where archived_at is null;
create index if not exists memories_user_recent_idx
  on public.memories (user_id, created_at desc)
  where archived_at is null;
create index if not exists memories_supersede_idx
  on public.memories (superseded_by)
  where superseded_by is not null;

-- HNSW index for semantic retrieval over the embedding column.
-- m=16, ef_construction=64 are good defaults for ~10k-100k vectors.
create index if not exists memories_embedding_hnsw
  on public.memories using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RLS: owner-only, mirroring the pattern used on tasks/categories/etc.
alter table public.memories enable row level security;

drop policy if exists memories_select_own on public.memories;
create policy memories_select_own on public.memories
  for select using (auth.uid() = user_id);

drop policy if exists memories_insert_own on public.memories;
create policy memories_insert_own on public.memories
  for insert with check (auth.uid() = user_id);

drop policy if exists memories_update_own on public.memories;
create policy memories_update_own on public.memories
  for update using (auth.uid() = user_id);

drop policy if exists memories_delete_own on public.memories;
create policy memories_delete_own on public.memories
  for delete using (auth.uid() = user_id);

commit;

-- ROLLBACK:
-- begin;
-- drop table if exists public.memories;
-- -- (leave the vector extension enabled — other features may use it)
-- commit;
