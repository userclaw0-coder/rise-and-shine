-- Atomic template item reorder: updates all sort_order values in a single transaction.
-- Prevents partial updates if an error occurs (unlike per-row client updates).
-- Run this migration before deploying the db.js change that calls this RPC.

create or replace function public.update_daily_template_items_order(
  p_user_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Verify caller matches p_user_id based on JWT subject
  begin
    v_auth_user := nullif(current_setting('request.jwt.claim.sub', true), '');
  exception
    when others then
      v_auth_user := null;
  end;

  if v_auth_user is null or v_auth_user <> p_user_id then
    raise exception 'update_daily_template_items_order: unauthorized for this user';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array of {id, sort_order}';
  end if;

  update daily_template_items d
  set sort_order = (v.sort_order)::int
  from jsonb_to_recordset(p_items) as v(id bigint, sort_order int)
  where d.id = v.id
    and d.user_id = p_user_id;
end;
$$;
