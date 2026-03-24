-- Weekly recursive-improvement runs (user-data coaching + app-tuning observations).
-- Safe to re-run.

create table if not exists public.weekly_improvement_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  source text not null default 'weekly_coach',
  status text not null default 'draft',
  input_hash text,
  prompt_version text,
  scoring_version text,
  model text,
  context_json jsonb not null default '{}'::jsonb,
  ai_output jsonb not null default '{}'::jsonb,
  accepted_action_ids text[] not null default '{}'::text[],
  rejected_action_ids text[] not null default '{}'::text[],
  applied_action_ids text[] not null default '{}'::text[],
  result_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start, source)
);

comment on table public.weekly_improvement_runs is 'Approval-based weekly improvement suggestions and observed downstream metrics.';
comment on column public.weekly_improvement_runs.source is 'weekly_coach | app_tuning_report | other future improvement pipelines';
comment on column public.weekly_improvement_runs.context_json is 'Computed weekly context bundle used to generate suggestions.';
comment on column public.weekly_improvement_runs.ai_output is 'Structured AI or heuristic output with grouped improvement proposals.';
comment on column public.weekly_improvement_runs.result_metrics is 'Observed results captured after decisions/applications or after the next week.';

create index if not exists weekly_improvement_runs_user_week_idx
  on public.weekly_improvement_runs (user_id, week_start desc);

create index if not exists weekly_improvement_runs_source_idx
  on public.weekly_improvement_runs (source, created_at desc);
