import assert from "node:assert/strict";
import { isRpcUnavailable, tryApplyPlannerMutationRpc } from "../lib/planner-apply-rpc.js";

function makeSupabaseRpc(response) {
  return {
    rpc: async () => response,
  };
}

async function run() {
  // Success path
  {
    const result = await tryApplyPlannerMutationRpc({
      supabase: makeSupabaseRpc({
        data: { task: { id: "t1", title: "Updated" }, tags: ["focus"] },
        error: null,
      }),
      userId: "u1",
      taskId: "t1",
      updates: { title: "Updated" },
      incomingTags: ["focus"],
    });

    assert.equal(result.applied, true);
    assert.equal(result.task?.id, "t1");
    assert.deepEqual(result.tags, ["focus"]);
  }

  // RPC unavailable path should return applied:false and not throw
  {
    const result = await tryApplyPlannerMutationRpc({
      supabase: makeSupabaseRpc({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      }),
      userId: "u1",
      taskId: "t1",
      updates: {},
      incomingTags: [],
    });

    assert.equal(result.applied, false);
    assert.equal(result.reason, "rpc_unavailable");
  }

  // Non-availability errors should still throw
  {
    await assert.rejects(
      () =>
        tryApplyPlannerMutationRpc({
          supabase: makeSupabaseRpc({
            data: null,
            error: { code: "42501", message: "permission denied" },
          }),
          userId: "u1",
          taskId: "t1",
          updates: {},
          incomingTags: [],
        }),
      (error) => error?.message === "permission denied"
    );
  }

  // Classification checks for message-based unavailable signals
  assert.equal(
    isRpcUnavailable({ message: 'function public.apply_planner_refinement_atomic does not exist' }),
    true
  );
  assert.equal(isRpcUnavailable({ message: "permission denied" }), false);

  console.log("verify-planner-rpc: OK");
}

run();
