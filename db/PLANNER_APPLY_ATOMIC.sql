-- Atomic planner-apply function for Rise-and-Shine
-- Applies task title/effort updates, additive tag merge, and planner refinement events
-- in a single transaction boundary (function execution is atomic in Postgres).

create or replace function public.apply_planner_refinement_atomic(
  p_user_id uuid,
  p_task_id bigint,
  p_suggested_title text default null,
  p_suggested_effort_hours numeric default null,
  p_suggested_tags_add text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_existing_tag_names text[] := '{}'::text[];
  v_incoming_tags text[] := '{}'::text[];
  v_final_tags text[] := '{}'::text[];
  v_tag_name text;
  v_tag_id bigint;
  v_task_json jsonb;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_task_id is null then
    raise exception 'p_task_id is required';
  end if;

  select *
  into v_task
  from tasks
  where user_id = p_user_id
    and id = p_task_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  -- Normalize incoming tags (trim, remove empties, de-duplicate case-insensitively)
  with normalized as (
    select distinct on (lower(trim(t))) trim(t) as name
    from unnest(coalesce(p_suggested_tags_add, '{}'::text[])) as t
    where nullif(trim(t), '') is not null
    order by lower(trim(t)), trim(t)
  )
  select coalesce(array_agg(name), '{}'::text[])
  into v_incoming_tags
  from normalized;

  -- Existing tag names (preserve current ordering where possible)
  select coalesce(array_agg(t.name), '{}'::text[])
  into v_existing_tag_names
  from task_tags tt
  join tags t on t.id = tt.tag_id and t.user_id = p_user_id
  where tt.user_id = p_user_id
    and tt.task_id = p_task_id;

  -- Additive merge: existing first, then new incoming tags not already present (case-insensitive)
  with all_names as (
    select t.name, row_number() over () as ord
    from unnest(v_existing_tag_names) as t(name)
    union all
    select i.name, 100000 + row_number() over () as ord
    from unnest(v_incoming_tags) as i(name)
  ),
  dedup as (
    select distinct on (lower(name)) name, ord
    from all_names
    order by lower(name), ord
  )
  select coalesce(array_agg(name order by ord), '{}'::text[])
  into v_final_tags
  from dedup;

  update tasks
  set
    title = coalesce(nullif(trim(p_suggested_title), ''), title),
    effort_hours = coalesce(p_suggested_effort_hours, effort_hours)
  where user_id = p_user_id
    and id = p_task_id;

  delete from task_tags
  where user_id = p_user_id
    and task_id = p_task_id;

  foreach v_tag_name in array v_final_tags
  loop
    select id
    into v_tag_id
    from tags
    where user_id = p_user_id
      and lower(name) = lower(v_tag_name)
    limit 1;

    if v_tag_id is null then
      insert into tags (user_id, name)
      values (p_user_id, v_tag_name)
      returning id into v_tag_id;
    end if;

    insert into task_tags (user_id, task_id, tag_id)
    values (p_user_id, p_task_id, v_tag_id)
    on conflict do nothing;

    v_tag_id := null;
  end loop;

  insert into task_events (user_id, task_id, event_type, value)
  values
    (
      p_user_id,
      p_task_id,
      'updated',
      jsonb_build_object(
        'source', 'planner_refinement',
        'action', 'update',
        'applied', jsonb_build_object(
          'title', nullif(trim(p_suggested_title), ''),
          'effort_hours', p_suggested_effort_hours,
          'tags_added', to_jsonb(v_incoming_tags)
        )
      )
    ),
    (
      p_user_id,
      p_task_id,
      'updated',
      jsonb_build_object(
        'source', 'planner_refinement',
        'action', 'applied',
        'applied_fields', to_jsonb(array_remove(array[
          case when nullif(trim(p_suggested_title), '') is not null then 'title' end,
          case when p_suggested_effort_hours is not null then 'effort_hours' end
        ], null)),
        'tags_added', to_jsonb(v_incoming_tags)
      )
    );

  select to_jsonb(t)
  into v_task_json
  from (
    select id, title, effort_hours
    from tasks
    where user_id = p_user_id
      and id = p_task_id
  ) t;

  return jsonb_build_object(
    'task', v_task_json,
    'tags', to_jsonb(v_final_tags)
  );
end;
$$;
