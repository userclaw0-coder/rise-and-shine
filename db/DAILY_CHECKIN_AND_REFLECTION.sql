-- PR-D adds two JSONB columns to daily_plans so morning check-in state and
-- end-of-day reflection live alongside the queue.
--
-- morning_state  per-day check-in captured before the day starts:
--                {energy: "low"|"medium"|"high", focus_text: "string",
--                 checked_in_at: ISO}
--                Read by the refill API to bias scoring (low energy → favor
--                lower-effort + lower-AE tasks) and to provide focus_text
--                tokens that the invention path can use to shape proposals.
--
-- reflection    per-day end-of-day audit captured after the queue resolves:
--                {entries: [{slot, landed: bool, felt: "easy"|"hard"|"neutral",
--                            note?: string}],
--                 submitted_at: ISO}
--                Read by future refills to learn activation-energy estimates
--                — if a vector / project / tag pattern repeatedly "felt
--                hard," subsequent picks for the same pattern get an AE
--                penalty until the pattern recovers.
--
-- Safe to re-run.

begin;

alter table public.daily_plans
  add column if not exists morning_state jsonb,
  add column if not exists reflection    jsonb;

comment on column public.daily_plans.morning_state is
  'Per-day check-in: {energy, focus_text, checked_in_at}. NULL = not yet checked in.';
comment on column public.daily_plans.reflection is
  'Per-day end-of-day audit: {entries, submitted_at}. NULL = not yet reflected.';

commit;

-- Rollback:
-- alter table public.daily_plans drop column if exists morning_state;
-- alter table public.daily_plans drop column if exists reflection;
