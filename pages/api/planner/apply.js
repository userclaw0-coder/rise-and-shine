import { createClient } from "@supabase/supabase-js";
import {
  buildPlannerTaskUpdates,
  mergePlannerTagNames,
  normalizeIncomingTags,
} from "../../../lib/planner-apply";
import { applyPlannerMutationWithRollback } from "../../../lib/planner-apply-transaction";
import { tryApplyPlannerMutationRpc } from "../../../lib/planner-apply-rpc";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function restoreTaskState({ userId, taskId, originalTask }) {
  if (!originalTask) return;
  await supabase
    .from("tasks")
    .update({ title: originalTask.title, effort_hours: originalTask.effort_hours })
    .eq("user_id", userId)
    .eq("id", taskId);
}

async function restoreTaskTags({ userId, taskId, originalTagIds }) {
  await supabase.from("task_tags").delete().eq("user_id", userId).eq("task_id", taskId);

  if (!Array.isArray(originalTagIds) || originalTagIds.length === 0) return;

  const restoreLinks = originalTagIds.map((tag_id) => ({ user_id: userId, task_id: taskId, tag_id }));
  await supabase.from("task_tags").insert(restoreLinks);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const authenticatedUserId = await getAuthenticatedUserId(req);

    const {
      user_id: requestedUserId,
      task_id,
      suggested_title,
      suggested_effort_minutes,
      suggested_tags_add,
    } = req.body || {};

    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      return res.status(403).json({ error: "user_id does not match authenticated user" });
    }

    const userId = authenticatedUserId;

    if (!task_id) return res.status(400).json({ error: "task_id required" });

    const { data: existingTask, error: taskErr } = await supabase
      .from("tasks")
      .select("id,title,effort_hours")
      .eq("user_id", userId)
      .eq("id", task_id)
      .maybeSingle();

    if (taskErr) throw taskErr;
    if (!existingTask) return res.status(404).json({ error: "Task not found" });

    const { data: initialTagLinks, error: initialTagErr } = await supabase
      .from("task_tags")
      .select("tag_id")
      .eq("user_id", userId)
      .eq("task_id", task_id);
    if (initialTagErr) throw initialTagErr;

    const originalTagIds = (initialTagLinks || []).map((r) => r.tag_id).filter(Boolean);

    const updates = buildPlannerTaskUpdates({
      suggested_title,
      suggested_effort_minutes,
    });

    const incomingTags = normalizeIncomingTags(suggested_tags_add);

    let updatedTask = existingTask;
    let finalTagNames = [];

    const rpcResult = await tryApplyPlannerMutationRpc({
      supabase,
      userId,
      taskId: task_id,
      updates,
      incomingTags,
    });

    if (rpcResult.applied) {
      updatedTask = rpcResult.task || existingTask;
      finalTagNames = Array.isArray(rpcResult.tags) ? rpcResult.tags : [];

      return res.json({
        ok: true,
        task: updatedTask,
        tags: finalTagNames,
        write_mode: "rpc_atomic",
      });
    }

    const requireRpcAtomic = process.env.PLANNER_APPLY_RPC_REQUIRED === "true";
    if (requireRpcAtomic) {
      return res.status(503).json({
        error: "Atomic planner apply RPC is required but unavailable",
        code: "planner_apply_rpc_required",
      });
    }

    await applyPlannerMutationWithRollback({
      mutateTask: async () => {
        if (Object.keys(updates).length === 0) return { mutated: false };

        const { data, error } = await supabase
          .from("tasks")
          .update(updates)
          .eq("user_id", userId)
          .eq("id", task_id)
          .select("id,title,effort_hours")
          .single();
        if (error) throw error;
        updatedTask = data;

        return { mutated: true };
      },
      mutateTags: async () => {
        if (incomingTags.length === 0) return { mutated: false, createdTagIds: [] };

        let existingTagRows = [];
        if (originalTagIds.length > 0) {
          const { data: rows, error: tagsErr } = await supabase
            .from("tags")
            .select("id,name")
            .eq("user_id", userId)
            .in("id", originalTagIds);
          if (tagsErr) throw tagsErr;
          existingTagRows = rows || [];
        }

        finalTagNames = mergePlannerTagNames(
          existingTagRows.map((r) => r.name),
          incomingTags
        );

        const ensuredIds = [];
        const createdTagIds = [];

        for (const name of finalTagNames) {
          const { data: found, error: foundErr } = await supabase
            .from("tags")
            .select("id")
            .eq("user_id", userId)
            .ilike("name", name)
            .limit(1)
            .maybeSingle();
          if (foundErr) throw foundErr;
          if (found?.id) {
            ensuredIds.push(found.id);
            continue;
          }

          const { data: created, error: createErr } = await supabase
            .from("tags")
            .insert({ user_id: userId, name })
            .select("id")
            .single();
          if (createErr) throw createErr;
          ensuredIds.push(created.id);
          createdTagIds.push(created.id);
        }

        const { error: clearErr } = await supabase
          .from("task_tags")
          .delete()
          .eq("user_id", userId)
          .eq("task_id", task_id);
        if (clearErr) throw clearErr;

        if (ensuredIds.length > 0) {
          const links = ensuredIds.map((tag_id) => ({ user_id: userId, task_id, tag_id }));
          const { error: insErr } = await supabase.from("task_tags").insert(links);
          if (insErr) throw insErr;
        }

        return { mutated: true, createdTagIds };
      },
      writeEvents: async () => {
        const { error: eventsErr } = await supabase.from("task_events").insert([
          {
            user_id: userId,
            task_id,
            event_type: "updated",
            value: {
              source: "planner_refinement",
              action: "update",
              applied: {
                title: updates.title ?? null,
                effort_hours: updates.effort_hours ?? null,
                tags_added: incomingTags,
              },
            },
          },
          {
            user_id: userId,
            task_id,
            event_type: "updated",
            value: {
              source: "planner_refinement",
              action: "applied",
              applied_fields: Object.keys(updates),
              tags_added: incomingTags,
            },
          },
        ]);

        if (eventsErr) throw eventsErr;
      },
      rollbackTask: () => restoreTaskState({ userId, taskId: task_id, originalTask: existingTask }),
      rollbackTags: () => restoreTaskTags({ userId, taskId: task_id, originalTagIds }),
      cleanupCreatedTags: async (createdTagIds) => {
        await supabase
          .from("tags")
          .delete()
          .eq("user_id", userId)
          .in("id", createdTagIds);
      },
    });

    return res.json({
      ok: true,
      task: updatedTask,
      tags: finalTagNames,
      write_mode: "rollback_fallback",
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
