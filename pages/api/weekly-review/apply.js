import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { flattenWeeklyCoachActions } from "../../../lib/weeklyImprovementContext";
import { mergeProjectWorkspace } from "../../../lib/projectWorkspace";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeIds(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

async function ensureTagIds(userId, names) {
  const ids = [];
  for (const name of normalizeIds(names)) {
    const { data: existing, error: existingErr } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.id) {
      ids.push(existing.id);
      continue;
    }
    const { data: created, error: createdErr } = await supabase
      .from("tags")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (createdErr) throw createdErr;
    ids.push(created.id);
  }
  return ids;
}

async function mergeTaskTags(userId, taskId, tagsAdd) {
  if (!Array.isArray(tagsAdd) || tagsAdd.length === 0) return;
  const { data: links, error: linksErr } = await supabase
    .from("task_tags")
    .select("tag_id")
    .eq("user_id", userId)
    .eq("task_id", taskId);
  if (linksErr) throw linksErr;

  const existingIds = new Set((links || []).map((row) => row.tag_id).filter(Boolean));
  const createdIds = await ensureTagIds(userId, tagsAdd);
  const inserts = createdIds
    .filter((id) => !existingIds.has(id))
    .map((tagId) => ({ user_id: userId, task_id: taskId, tag_id: tagId }));
  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from("task_tags").insert(inserts);
    if (insertErr) throw insertErr;
  }
}

async function logActionEvent(userId, taskId, payload) {
  if (!taskId) return;
  await supabase.from("task_events").insert({
    user_id: userId,
    task_id: taskId,
    event_type: "updated",
    value: payload,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const userId = await getAuthenticatedUserId(req);
    const weekStart = String(req.body?.week_start || "").slice(0, 10);
    if (!weekStart) return res.status(400).json({ error: "week_start is required" });

    const acceptedActionIds = normalizeIds(req.body?.accepted_action_ids);
    const rejectedActionIds = normalizeIds(req.body?.rejected_action_ids);

    const { data: run, error: runErr } = await supabase
      .from("weekly_improvement_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .eq("source", "weekly_coach")
      .maybeSingle();
    if (runErr) throw runErr;
    if (!run) return res.status(404).json({ error: "No weekly improvement run found for that week." });

    const actions = flattenWeeklyCoachActions(run.ai_output || {});
    const byId = new Map(actions.map((action) => [String(action.id), action]));
    const appliedActionIds = [];

    for (const actionId of acceptedActionIds) {
      const action = byId.get(actionId);
      if (!action?.apply_patch) continue;

      if (action.apply_patch.task && action.task_id) {
        const taskPatch = { ...(action.apply_patch.task || {}) };
        Object.keys(taskPatch).forEach((key) => {
          if (taskPatch[key] === null || taskPatch[key] === undefined || (Array.isArray(taskPatch[key]) && taskPatch[key].length === 0)) {
            delete taskPatch[key];
          }
        });
        if (Object.keys(taskPatch).length > 0) {
          const { error: updateErr } = await supabase
            .from("tasks")
            .update(taskPatch)
            .eq("id", action.task_id)
            .eq("user_id", userId);
          if (updateErr) throw updateErr;
        }
        if (Array.isArray(action.apply_patch.tags_add) && action.apply_patch.tags_add.length > 0) {
          await mergeTaskTags(userId, action.task_id, action.apply_patch.tags_add);
        }
        await logActionEvent(userId, action.task_id, {
          source: "weekly_coach",
          action: "applied",
          action_id: actionId,
          week_start: weekStart,
          patch: action.apply_patch,
        });
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.apply_patch.create_task && action.parent_task_id) {
        const { data: parent, error: parentErr } = await supabase
          .from("tasks")
          .select("category_id, subcategory_id, outcome_ids, primary_life_domain, life_domains")
          .eq("id", action.parent_task_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (parentErr) throw parentErr;
        if (!parent) continue;

        const createTaskPayload = {
          user_id: userId,
          title: action.apply_patch.create_task.title,
          status: "todo",
          priority: "Medium",
          effort_hours: Number(action.apply_patch.create_task.estimated_minutes || 30) / 60,
          parent_task_id: action.parent_task_id,
          category_id: parent.category_id,
          subcategory_id: parent.subcategory_id,
          outcome_ids: parent.outcome_ids || [],
          primary_life_domain: parent.primary_life_domain || null,
          life_domains: parent.life_domains || [],
          alignment_source:
            parent.primary_life_domain || (Array.isArray(parent.outcome_ids) && parent.outcome_ids.length > 0)
              ? "ai"
              : null,
        };
        const { data: created, error: createErr } = await supabase
          .from("tasks")
          .insert(createTaskPayload)
          .select("id")
          .single();
        if (createErr) throw createErr;
        if (Array.isArray(action.apply_patch.create_task.tags)) {
          await mergeTaskTags(userId, created.id, action.apply_patch.create_task.tags);
        }
        await logActionEvent(userId, action.parent_task_id, {
          source: "weekly_coach",
          action: "subtask_created",
          action_id: actionId,
          created_task_id: created.id,
          week_start: weekStart,
        });
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.apply_patch.workspace && action.category_id) {
        const { data: profileRow, error: profileErr } = await supabase
          .from("user_profile")
          .select("profile")
          .eq("user_id", userId)
          .maybeSingle();
        if (profileErr) throw profileErr;

        const profile = profileRow?.profile || {};
        const prefs = { ...(profile.preferences || {}) };
        const current = mergeProjectWorkspace(prefs, action.category_id);
        const rawMap = { ...(prefs.project_workspaces || {}) };
        const currentMoves = Array.isArray(current.suggested_moves) ? current.suggested_moves : [];
        const nextSuggestedMove = action.apply_patch.workspace.suggested_move;
        rawMap[String(action.category_id)] = {
          ...current,
          efficiency_tip:
            current.efficiency_tip || action.apply_patch.workspace.efficiency_tip || "",
          suggested_moves: nextSuggestedMove
            ? Array.from(new Set([...currentMoves, nextSuggestedMove]))
            : currentMoves,
        };
        prefs.project_workspaces = rawMap;
        const { error: saveErr } = await supabase
          .from("user_profile")
          .upsert({ user_id: userId, profile: { ...profile, preferences: prefs } }, { onConflict: "user_id" });
        if (saveErr) throw saveErr;
        appliedActionIds.push(actionId);
      }
    }

    const nextAccepted = normalizeIds([...(run.accepted_action_ids || []), ...acceptedActionIds]);
    const nextRejected = normalizeIds([...(run.rejected_action_ids || []), ...rejectedActionIds]);
    const nextApplied = normalizeIds([...(run.applied_action_ids || []), ...appliedActionIds]);

    const { data: updatedRun, error: updateRunErr } = await supabase
      .from("weekly_improvement_runs")
      .update({
        status: nextApplied.length > 0 ? "applied" : "reviewed",
        accepted_action_ids: nextAccepted,
        rejected_action_ids: nextRejected,
        applied_action_ids: nextApplied,
        result_metrics: {
          accepted_count: nextAccepted.length,
          rejected_count: nextRejected.length,
          applied_count: nextApplied.length,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateRunErr) throw updateRunErr;

    return res.json({
      ok: true,
      run: updatedRun,
      accepted_action_ids: nextAccepted,
      rejected_action_ids: nextRejected,
      applied_action_ids: nextApplied,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to apply weekly improvement actions.",
    });
  }
}
