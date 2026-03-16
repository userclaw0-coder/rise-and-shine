-- Atomic template item reorder: updates all sort_order values in a single transaction.
-- Prevents partial updates if an error occurs (unlike per-row client updates).
-- Run this migration before deploying the db.js change that calls this RPC.

create or replace function public.update_daily_template_items_order(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array of {id, sort_order}';
  end if;

  update daily_template_items d
  set sort_order = (v.sort_order)::int
  from jsonb_to_recordset(p_items) as v(id bigint, sort_order int)
  where d.id = v.id;
end;
$$;
