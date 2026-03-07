function isRpcUnavailable(error) {
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  const code = String(error?.code || "");
  const blob = `${message} ${details} ${hint}`.toLowerCase();

  return (
    code === "PGRST202" ||
    blob.includes("could not find the function") ||
    blob.includes("function") && blob.includes("does not exist") ||
    blob.includes("schema cache")
  );
}

function normalizeRpcResult(data) {
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid apply_planner_refinement_atomic response payload");
  }

  return {
    task: payload.task || null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
  };
}

export async function tryApplyPlannerMutationRpc({
  supabase,
  userId,
  taskId,
  updates,
  incomingTags,
}) {
  const { data, error } = await supabase.rpc("apply_planner_refinement_atomic", {
    p_user_id: userId,
    p_task_id: taskId,
    p_suggested_title: updates.title ?? null,
    p_suggested_effort_hours: updates.effort_hours ?? null,
    p_suggested_tags_add: incomingTags,
  });

  if (error) {
    if (isRpcUnavailable(error)) {
      return { applied: false, reason: "rpc_unavailable" };
    }
    throw error;
  }

  const normalized = normalizeRpcResult(data);

  return {
    applied: true,
    task: normalized.task,
    tags: normalized.tags,
  };
}
