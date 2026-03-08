import assert from "node:assert/strict";

import {
  buildHeuristicEnrichment,
  isMissingPrioritizationMetadata,
  computeTaskPatch,
  mergeTagNames,
} from "../lib/task-enrichment.js";

(function verifyMissingMetadataDetection() {
  const missing = isMissingPrioritizationMetadata({
    priority: null,
    effort_hours: null,
    tags: [],
  });
  assert.equal(missing, true, "task without priority/effort/tags should be marked missing");

  const complete = isMissingPrioritizationMetadata({
    priority: "High",
    effort_hours: 1,
    tags: ["urgent"],
  });
  assert.equal(complete, false, "task with key fields should not be marked missing");
})();

(function verifyHeuristicUrgencySignal() {
  const enrichment = buildHeuristicEnrichment({
    title: "Send contract amendment",
    due_date: "2026-03-09",
    tags: [],
  }, new Date("2026-03-08T12:00:00.000Z"));

  assert.equal(enrichment.priority, "High", "due soon item should be at least High");
  assert.ok(enrichment.tags_add.includes("urgent"), "due soon should receive urgent tag");
})();

(function verifyPatchOnlyFillsMissingFields() {
  const patchA = computeTaskPatch(
    { priority: null, effort_hours: null },
    { priority: "Medium", effort_bucket: "S" }
  );
  assert.deepEqual(
    patchA,
    { priority: "Medium", effort_hours: 0.5 },
    "missing fields should be filled"
  );

  const patchB = computeTaskPatch(
    { priority: "Critical", effort_hours: 2 },
    { priority: "Low", effort_bucket: "XS" }
  );
  assert.deepEqual(patchB, {}, "existing values should not be overwritten");
})();

(function verifyTagMergeIsAdditive() {
  const merged = mergeTagNames(["urgent"], ["quick-win", "Urgent"]);
  assert.deepEqual(merged.sort(), ["quick-win", "urgent"], "tag merge should dedupe and preserve additivity");
})();

console.log("verify-task-enrichment: OK");
