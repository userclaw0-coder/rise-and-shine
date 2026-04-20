-- Add a JSONB scores column to ideas so the coach can persist
-- structured assessments (alignment, leverage, feasibility, novelty,
-- timing, heat) plus a short critique. Safe to re-run.

alter table public.ideas
  add column if not exists scores jsonb not null default '{}'::jsonb;

comment on column public.ideas.scores is
  'Coach-computed assessments: {alignment, leverage, feasibility, novelty, timing, heat, critique, scored_at}. 0-100 ints where applicable.';
