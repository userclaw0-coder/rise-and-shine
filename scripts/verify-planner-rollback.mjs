import assert from "node:assert/strict";

import { applyPlannerMutationWithRollback } from "../lib/planner-apply-transaction.js";

async function runScenario({ failAt, failRollbackAt, expect, assertError }) {
  const calls = [];

  const failIf = (stage) => {
    if (failAt === stage) {
      throw new Error(`forced_${stage}_failure`);
    }
  };

  const failRollbackIf = (stage) => {
    if (failRollbackAt === stage) {
      throw new Error(`forced_${stage}_failure`);
    }
  };

  let caughtError;

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
        failRollbackIf("rollbackTask");
      },
      rollbackTags: async () => {
        calls.push("rollbackTags");
        failRollbackIf("rollbackTags");
      },
      cleanupCreatedTags: async (ids) => {
        calls.push(`cleanupCreatedTags:${ids.join(",")}`);
        failRollbackIf("cleanupCreatedTags");
      },
    });

    if (failAt || failRollbackAt) {
      assert.fail(`Expected failure at ${failAt || failRollbackAt}`);
    }
  } catch (error) {
    caughtError = error;
    if (!failAt && !failRollbackAt) throw error;
    if (assertError) {
      assertError(error);
    } else {
      assert.match(error.message, new RegExp(`forced_${failAt}_failure`));
    }
  }

  assert.deepEqual(calls, expect, `unexpected call order for failAt=${failAt || "none"}`);
  return caughtError;
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

await runScenario({
  failAt: "events",
  failRollbackAt: "rollbackTask",
  expect: [
    "mutateTask",
    "mutateTags",
    "writeEvents",
    "rollbackTask",
    "rollbackTags",
    "cleanupCreatedTags:tag-1,tag-2",
  ],
  assertError: (error) => {
    assert.match(error.message, /planner_apply_failed_and_rollback_incomplete/);
    assert.match(error.message, /forced_events_failure/);
    assert.match(error.message, /rollbackTask: forced_rollbackTask_failure/);
    assert.ok(Array.isArray(error.rollbackErrors));
    assert.equal(error.rollbackErrors.length, 1);
    assert.equal(error.rollbackErrors[0].stage, "rollbackTask");
    assert.equal(error.rollbackErrors[0].message, "forced_rollbackTask_failure");
    assert.equal(error.cause?.message, "forced_events_failure");
  },
});

console.log("verify-planner-rollback: OK");
