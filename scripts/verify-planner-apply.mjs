import assert from "node:assert/strict";

import {
  buildPlannerTaskUpdates,
  mergePlannerTagNames,
  normalizeIncomingTags,
} from "../lib/planner-apply.js";

(function verifyTaskUpdateNormalization() {
  const updates = buildPlannerTaskUpdates({
    suggested_title: "  Tighten follow-up email copy  ",
    suggested_effort_minutes: "95",
  });

  assert.deepEqual(
    updates,
    { title: "Tighten follow-up email copy", effort_hours: 1.58 },
    "title should trim and effort minutes should normalize to rounded effort_hours"
  );
})();

(function verifyMissingFieldsDoNotOverwrite() {
  const updates = buildPlannerTaskUpdates({
    suggested_title: "   ",
    suggested_effort_minutes: null,
  });

  assert.deepEqual(
    updates,
    {},
    "empty suggested fields should not produce updates"
  );
})();

(function verifyIncomingTagNormalization() {
  const tags = normalizeIncomingTags(["  Focus  ", "focus", "", "Deep Work", "deep work"]);
  assert.deepEqual(
    tags,
    ["Focus", "focus", "Deep Work", "deep work"],
    "incoming tag list should trim and preserve explicit case variants before merge"
  );
})();

(function verifyAdditiveTagMergeInvariant() {
  const merged = mergePlannerTagNames(
    ["Urgent", "Deep Work"],
    ["deep work", "Focus", "urgent", "Momentum"]
  );

  assert.deepEqual(
    merged,
    ["Urgent", "Deep Work", "Focus", "Momentum"],
    "merge should preserve existing tags and add only new case-insensitive tags"
  );
})();

console.log("verify-planner-apply: OK");
