import assert from "node:assert/strict";

import {
  countRefinementActions,
  getRefinementActionFromEvent,
} from "../lib/planner-refinement-events.js";

(function verifyLegacyUpdatedEventMapping() {
  const accepted = getRefinementActionFromEvent({
    event_type: "updated",
    value: { source: "planner_refinement", action: "accept" },
  });
  const applied = getRefinementActionFromEvent({
    event_type: "updated",
    value: { source: "planner_refinement", action: "applied" },
  });
  const dismissed = getRefinementActionFromEvent({
    event_type: "updated",
    value: { source: "planner_refinement", action: "dismiss" },
  });

  assert.equal(accepted, "accepted", "legacy accept action should map to accepted");
  assert.equal(applied, "applied", "legacy applied action should map to applied");
  assert.equal(dismissed, "dismissed", "legacy dismiss action should map to dismissed");
})();

(function verifyExplicitEventTypeCompatibility() {
  assert.equal(
    getRefinementActionFromEvent({ event_type: "planner_refinement_accepted" }),
    "accepted",
    "explicit accepted event type should be supported"
  );
  assert.equal(
    getRefinementActionFromEvent({ event_type: "planner_refinement_applied" }),
    "applied",
    "explicit applied event type should be supported"
  );
  assert.equal(
    getRefinementActionFromEvent({ event_type: "planner_refinement_dismissed" }),
    "dismissed",
    "explicit dismissed event type should be supported"
  );
})();

(function verifyCountingIgnoresNonRefinementRows() {
  const counts = countRefinementActions([
    { event_type: "updated", value: { source: "planner_refinement", action: "accept" } },
    { event_type: "planner_refinement_applied" },
    { event_type: "updated", value: { source: "planner_refinement", action: "dismiss" } },
    { event_type: "updated", value: { source: "other", action: "accept" } },
    { event_type: "completed" },
  ]);

  assert.deepEqual(
    counts,
    { accepted: 1, applied: 1, dismissed: 1 },
    "counting should include both explicit and legacy refinement events only"
  );
})();

console.log("verify-refinement-events: OK");
