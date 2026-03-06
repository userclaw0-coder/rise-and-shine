import assert from "node:assert/strict";

import {
  chooseKeyOutcomes,
  computeTaskScore,
  DAILY_KEY_OUTCOMES_COUNT,
} from "../lib/scoring.js";

const now = new Date("2026-03-06T12:00:00.000Z");

function task(id, overrides = {}) {
  return {
    id,
    title: id,
    priority: "Medium",
    effort_hours: 0.5,
    category: "Business",
    tags: [],
    ...overrides,
  };
}

(function verifyBlockedWaitingExclusion() {
  const tasks = [
    task("blocked-task", { priority: "Critical", tags: ["blocked"] }),
    task("waiting-task", { priority: "Critical", tags: ["waiting"] }),
    task("allowed-task", { priority: "Low", tags: ["quick-win"] }),
  ];

  const picked = chooseKeyOutcomes(tasks, { now, count: DAILY_KEY_OUTCOMES_COUNT });
  const pickedIds = picked.map((x) => x.task.id);

  assert.ok(!pickedIds.includes("blocked-task"), "blocked tasks must be excluded");
  assert.ok(!pickedIds.includes("waiting-task"), "waiting tasks must be excluded");
  assert.ok(pickedIds.includes("allowed-task"), "eligible task should be selected");
})();

(function verifySlotIntent() {
  const tasks = [
    task("quick", { tags: ["quick-win"], effort_hours: 0.25, priority: "Low" }),
    task("leverage", { tags: ["high-leverage"], priority: "Medium" }),
    task("progress", { priority: "High", effort_hours: 1.5 }),
    task("extra", { priority: "Low" }),
  ];

  const picked = chooseKeyOutcomes(tasks, { now, count: DAILY_KEY_OUTCOMES_COUNT });
  const ids = picked.map((x) => x.task.id);

  assert.ok(ids.includes("quick"), "selection should include a quick-win candidate");
  assert.ok(ids.includes("leverage"), "selection should include a high-leverage candidate");
})();

(function verifyScoreShape() {
  const result = computeTaskScore(task("sample", { tags: ["quick-win"] }), { now });
  assert.equal(typeof result.score, "number", "score should be numeric");
  assert.equal(typeof result.components, "object", "components should exist");
  assert.equal(result.components.isQuickWin, true, "quick-win tag should be reflected");
})();

console.log("verify-scoring: OK");
