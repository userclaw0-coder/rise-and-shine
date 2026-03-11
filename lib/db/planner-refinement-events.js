// DB query for planner refinement events in a date range (task_events).
// Event semantics and count helpers (getRefinementActionFromEvent, countRefinementActions) live in lib/planner-refinement-events.js.

import { supabase } from "../supabaseClient";

function wrap(resultPromise) {
  return resultPromise.then(({ data, error }) => ({ data, error }));
}

export function getPlannerRefinementEventsInRange(userId, startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  end.setDate(end.getDate() + 1);

  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, event_type, created_at, value")
      .eq("user_id", userId)
      // task_events.event_type is enum-constrained in production; planner refinement
      // analytics are logged via legacy-compatible "updated" rows with value metadata.
      .eq("event_type", "updated")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
  );
}
