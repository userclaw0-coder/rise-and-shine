-- External AI project import runs.
-- Safe to re-run.

create table if not exists public.external_ai_import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  status text not null default 'draft',
  source text not null default 'external_ai',
  source_model text,
  prompt_version text,
  schema_version text,
  input_hash text,
  raw_text text not null default '',
  raw_json jsonb not null default '{}'::jsonb,
  normalized_json jsonb not null default '{}'::jsonb,
  preview_metrics jsonb not null default '{}'::jsonb,
  accepted_action_ids text[] not null default '{}'::text[],
  rejected_action_ids text[] not null default '{}'::text[],
  applied_action_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.external_ai_import_runs is 'Approval-based imports generated from external AI project planning chats.';
comment on column public.external_ai_import_runs.raw_text is 'Original pasted response from Claude, Grok, ChatGPT, or another external AI.';
comment on column public.external_ai_import_runs.raw_json is 'Best-effort parsed JSON directly from the pasted model output.';
comment on column public.external_ai_import_runs.normalized_json is 'Sanitized import payload used for previewing and applying changes.';
comment on column public.external_ai_import_runs.preview_metrics is 'Counts and summary stats for the normalized import payload.';

create index if not exists external_ai_import_runs_user_category_idx
  on public.external_ai_import_runs (user_id, category_id, created_at desc);

create index if not exists external_ai_import_runs_status_idx
  on public.external_ai_import_runs (status, created_at desc);
