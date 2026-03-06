import assert from "node:assert/strict";

import { applyPlannerMutationWithRollback } from "../lib/planner-apply-transaction.js";

async function runScenario({ failAt, expect }) {
  const calls = [];

  const failIf = (stage) => {
    if (failAt === stage) {
      throw new Error(`forced_${stage}_failure`);
    }
  };

  try {
    await applyPlannerMutationWithRollback({
      mutateTask: async () => {
        calls.push("mutateTask");
        failIf("task");
        return { mutated: true };
      },
      mutateTags: async () => {
        calls.push("mutateTags");
        failIf("tags");
        return { mutated: true, createdTagIds: ["tag-1", "tag-2"] };
      },
      writeEvents: async () => {
        calls.push("writeEvents");
        failIf("events");
      },
      rollbackTask: async () => {
        calls.push("rollbackTask");
      },
      rollbackTags: async () => {
        calls.push("rollbackTags");
      },
      cleanupCreatedTags: async (ids) => {
        calls.push(`cleanupCreatedTags:${ids.join(",")}`);
      },
    });

    if (failAt) {
      assert.fail(`Expected failure at ${failAt}`);
    }
  } catch (error) {
    if (!failAt) throw error;
    assert.match(error.message, new RegExp(`forced_${failAt}_failure`));
  }

  assert.deepEqual(calls, expect, `unexpected call order for failAt=${failAt || "none"}`);
}

await runScenario({
  failAt: null,
  expect: ["mutateTask", "mutateTags", "writeEvents"],
});

await runScenario({
  failAt: "task",
  expect: ["mutateTask"],
});

await runScenario({
  failAt: "tags",
  expect: ["mutateTask", "mutateTags", "rollbackTask"],
});

await runScenario({
  failAt: "events",
  expect: [
    "mutateTask",
    "mutateTags",
    "writeEvents",
    "rollbackTask",
    "rollbackTags",
    "cleanupCreatedTags:tag-1,tag-2",
  ],
});

console.log("verify-planner-rollback: OK");
