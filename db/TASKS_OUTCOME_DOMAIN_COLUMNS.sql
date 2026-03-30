-- Task–outcome and task–human-need-strategy alignment (for analytics)
-- Run once on existing `tasks` table before deploying app code that uses these columns. Safe to re-run (IF NOT EXISTS / defaults).

-- Outcome IDs: references to user_profile.profile.desired_outcomes[].id (e.g. "vision-0", "vision-1")
alter table public.tasks
  add column if not exists outcome_ids text[] not null default '{}';

-- Primary stored strategy key: one of the vision life_domains keys (business, finances, health, relationships, lifestyle, growth)
alter table public.tasks
  add column if not exists primary_life_domain text;

-- Optional: multiple stored strategy keys this task touches
alter table public.tasks
  add column if not exists life_domains text[] default '{}';

-- Who set the alignment: 'user' | 'ai' | null (unset)
alter table public.tasks
  add column if not exists alignment_source text;

comment on column public.tasks.outcome_ids is 'IDs from user_profile.profile.desired_outcomes (e.g. vision-0)';
comment on column public.tasks.primary_life_domain is 'Primary stored strategy key from vision / Human Need Strategies (e.g. business, health)';
comment on column public.tasks.life_domains is 'All stored strategy keys this task touches (optional)';
comment on column public.tasks.alignment_source is 'user | ai | null';
