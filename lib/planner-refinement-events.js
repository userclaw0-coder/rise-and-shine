// Event type mapping and counts for planner refinement analytics (accepted/applied/dismissed).
// DB queries for events in a date range live in lib/db/planner-refinement-events.js.

export const REFINEMENT_ACTIONS = {
  ACCEPTED: "accepted",
  APPLIED: "applied",
  DISMISSED: "dismissed",
};

const ACTION_BY_EVENT_TYPE = {
  planner_refinement_accepted: REFINEMENT_ACTIONS.ACCEPTED,
  planner_refinement_applied: REFINEMENT_ACTIONS.APPLIED,
  planner_refinement_dismissed: REFINEMENT_ACTIONS.DISMISSED,
};

const ACTION_BY_LEGACY_VALUE = {
  accept: REFINEMENT_ACTIONS.ACCEPTED,
  applied: REFINEMENT_ACTIONS.APPLIED,
  dismiss: REFINEMENT_ACTIONS.DISMISSED,
};

export function getRefinementActionFromEvent(event) {
  if (!event || typeof event !== "object") return null;

  const direct = ACTION_BY_EVENT_TYPE[event.event_type];
  if (direct) return direct;

  if (event.event_type !== "updated") return null;
  if (event.value?.source !== "planner_refinement") return null;

  return ACTION_BY_LEGACY_VALUE[event.value?.action] || null;
}

export function countRefinementActions(events) {
  const counts = {
    [REFINEMENT_ACTIONS.ACCEPTED]: 0,
    [REFINEMENT_ACTIONS.APPLIED]: 0,
    [REFINEMENT_ACTIONS.DISMISSED]: 0,
  };

  for (const event of events || []) {
    const action = getRefinementActionFromEvent(event);
    if (!action) continue;
    counts[action] += 1;
  }

  return counts;
}
