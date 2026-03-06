import assert from "node:assert/strict";

import {
  buildQueueCandidates,
  buildQueueFromChosen,
  shouldRefillAfterCompletion,
} from "../lib/today-queue.js";

function task(id, overrides = {}) {
  return {
    id,
    status: "todo",
    category: "Business",
    tags: [],
    ...overrides,
  };
}

(function verifyCandidateFiltering() {
  const tasks = [
    task("daily-repeat", { category: "Daily Repeat" }),
    task("blocked", { tags: ["blocked"] }),
    task("waiting-nested", { tags: [{ tag: { name: "WAITING" } }] }),
    task("done", { status: "done" }),
    task("daily-template"),
    task("keep-me", { status: "doing" }),
  ];

  const filtered = buildQueueCandidates(tasks, ["daily-template"]);
  const ids = filtered.map((t) => t.id);

  assert.deepEqual(ids, ["keep-me"], "candidate filter should keep only eligible todo/doing tasks");
})();

(function verifyQueuePayloadShape() {
  const chosen = [
    { task: task("q1") },
    { task: task("h1") },
    { task: task("p1") },
  ];
  const queue = buildQueueFromChosen(chosen);

  assert.deepEqual(queue, [
    { slot: 1, type: "Quick Win", task_id: "q1" },
    { slot: 2, type: "High Leverage", task_id: "h1" },
    { slot: 3, type: "Progress", task_id: "p1" },
  ]);
})();

(function verifyRefillTriggerLogic() {
  const queueTaskIds = ["a", "b", "c"];

  assert.equal(
    shouldRefillAfterCompletion({
      taskId: "a",
      wasCompleted: false,
      queueTaskIds,
      completionMap: { a: true, b: true, c: true },
    }),
    true,
    "should refill only when all 3 queue tasks are complete after this toggle"
  );

  assert.equal(
    shouldRefillAfterCompletion({
      taskId: "a",
      wasCompleted: true,
      queueTaskIds,
      completionMap: { a: false, b: true, c: true },
    }),
    false,
    "un-completing a task must not refill"
  );

  assert.equal(
    shouldRefillAfterCompletion({
      taskId: "x",
      wasCompleted: false,
      queueTaskIds,
      completionMap: { a: true, b: true, c: true, x: true },
    }),
    false,
    "completing non-queue task must not refill"
  );
})();

console.log("verify-queue-lifecycle: OK");
