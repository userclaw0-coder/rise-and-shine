import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  EXTERNAL_PROJECT_IMPORT_SOURCE,
  flattenExternalProjectImportActions,
} from "../../../lib/externalProjectImport";
import {
  createTaskCollaborative,
  saveSharedProjectWorkspace,
  serviceSupabase as collabSupabase,
  setTaskTagsCollaborative,
  updateTaskCollaborative,
} from "../../../lib/projectCollaboration";

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
  const tagIds = await ensureTagIds(userId, tagsAdd);
  const inserts = tagIds
    .filter((tagId) => !existingIds.has(tagId))
    .map((tagId) => ({ user_id: userId, task_id: taskId, tag_id: tagId }));
  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from("task_tags").insert(inserts);
    if (insertErr) throw insertErr;
  }
}

async function mergeCollaborativeTagNames(actorUserId, taskId, tagsAdd) {
  const { data: taskRow, error } = await collabSupabase
    .from("tasks")
    .select("tags:task_tags(tag:tags(name))")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  const existing = (taskRow?.tags || [])
    .map((row) => row?.tag?.name)
    .filter(Boolean);
  const merged = Array.from(new Set([...(existing || []), ...(tagsAdd || [])].map((value) => String(value || "").trim()).filter(Boolean)));
  await setTaskTagsCollaborative(actorUserId, taskId, merged);
}

async function logTaskEvent(userId, taskId, payload) {
  if (!taskId) return;
  const { error } = await supabase.from("task_events").insert({
    user_id: userId,
    task_id: taskId,
    event_type: "updated",
    value: payload,
  });
  if (error) throw error;
}

function nextOutcomeId(profile) {
  const existingIds = (profile?.desired_outcomes || [])
    .map((outcome) => String(outcome?.id || ""))
    .filter(Boolean);
  let max = -1;
  existingIds.forEach((id) => {
    const match = id.match(/^vision-(\d+)$/);
    if (!match) return;
    max = Math.max(max, Number(match[1]));
  });
  return `vision-${max + 1}`;
}

function applyVisionPatch(profile, action, categoryId) {
  const next = { ...(profile || {}) };
  if (action?.action === "add_desired_outcome" && action.outcome?.title) {
    const outcomes = Array.isArray(next.desired_outcomes) ? [...next.desired_outcomes] : [];
    const outcome = {
      ...action.outcome,
      id:
        action.outcome.id && !outcomes.some((item) => item.id === action.outcome.id)
          ? action.outcome.id
          : nextOutcomeId(next),
    };
    outcomes.push(outcome);
    next.desired_outcomes = outcomes;
    return next;
  }

  if (action?.action === "update_desired_outcome" && action.outcome_id) {
    next.desired_outcomes = (next.desired_outcomes || []).map((outcome) =>
      String(outcome?.id) === String(action.outcome_id)
        ? { ...outcome, ...(action.outcome || {}), id: action.outcome_id }
        : outcome
    );
    return next;
  }

  if (action?.action === "add_quarter_focus" && action.focus) {
    next.quarter_focus = Array.from(
      new Set([...(next.quarter_focus || []), action.focus].filter(Boolean))
    );
    return next;
  }

  if (action?.action === "add_strategy_note" && action.note) {
    const prefs = { ...(next.preferences || {}) };
    const notes = Array.isArray(prefs.external_ai_strategy_notes)
      ? [...prefs.external_ai_strategy_notes]
      : [];
    notes.unshift({
      id: action.id,
      category_id: categoryId,
      note: action.note,
      source: EXTERNAL_PROJECT_IMPORT_SOURCE,
      created_at: new Date().toISOString(),
    });
    prefs.external_ai_strategy_notes = notes.slice(0, 40);
    next.preferences = prefs;
    return next;
  }

  return next;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const userId = await getAuthenticatedUserId(req);
    const runId = String(req.body?.run_id || "").trim();
    if (!runId) return res.status(400).json({ error: "run_id is required" });

    const acceptedActionIds = normalizeIds(req.body?.accepted_action_ids);
    const rejectedActionIds = normalizeIds(req.body?.rejected_action_ids);

    const { data: run, error: runErr } = await supabase
      .from("external_ai_import_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    if (runErr) throw runErr;
    if (!run) return res.status(404).json({ error: "Import run not found." });

    const actions = flattenExternalProjectImportActions(run.normalized_json || {}, run.category_id);
    const byId = new Map(actions.map((action) => [String(action.id), action]));
    const appliedActionIds = [];

    const needsProfileSave = acceptedActionIds.some((id) => {
      const action = byId.get(id);
      return action?.apply_patch?.workspace || action?.apply_patch?.vision;
    });

    let profile = null;
    let profileDirty = false;
    if (needsProfileSave) {
      const { data: profileRow, error: profileErr } = await supabase
        .from("user_profile")
        .select("profile")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileErr) throw profileErr;
      profile = profileRow?.profile || {};
    }

    for (const actionId of acceptedActionIds) {
      const action = byId.get(actionId);
      if (!action?.apply_patch) continue;

      if (action.apply_patch.workspace && run.category_id) {
        const patch = { ...(action.apply_patch.workspace || {}) };
        // Handle knowledge_base_append by merging with existing KB
        if (patch.knowledge_base_append) {
          const { data: kbRow } = await supabase
            .from("shared_project_workspaces")
            .select("knowledge_base")
            .eq("category_id", run.category_id)
            .maybeSingle();
          patch.knowledge_base = (kbRow?.knowledge_base || "") + "\n\n" + patch.knowledge_base_append;
          delete patch.knowledge_base_append;
        }
        await saveSharedProjectWorkspace(userId, run.category_id, patch);
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.apply_patch.task && action.task_id) {
        const taskPatch = { ...(action.apply_patch.task || {}) };
        Object.keys(taskPatch).forEach((key) => {
          if (
            taskPatch[key] === null ||
            taskPatch[key] === undefined ||
            (Array.isArray(taskPatch[key]) && taskPatch[key].length === 0)
          ) {
            delete taskPatch[key];
          }
        });
        if (Object.keys(taskPatch).length > 0) {
          await updateTaskCollaborative(userId, action.task_id, taskPatch);
        }
        if (Array.isArray(action.apply_patch.tags_add) && action.apply_patch.tags_add.length > 0) {
          await mergeCollaborativeTagNames(userId, action.task_id, action.apply_patch.tags_add);
        }
        await logTaskEvent(userId, action.task_id, {
          source: EXTERNAL_PROJECT_IMPORT_SOURCE,
          action: "applied",
          action_id: actionId,
          run_id: run.id,
          patch: action.apply_patch,
        });
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.apply_patch.create_task && action.parent_task_id) {
        const { data: parent, error: parentErr } = await collabSupabase
          .from("tasks")
          .select("category_id, subcategory_id, outcome_ids, primary_life_domain, life_domains")
          .eq("id", action.parent_task_id)
          .maybeSingle();
        if (parentErr) throw parentErr;
        if (!parent) continue;

        const patch = action.apply_patch.create_task;
        const createPayload = {
          title: patch.title,
          status: patch.status || "todo",
          priority: patch.priority || "Medium",
          effort_hours: patch.effort_hours ?? null,
          due_date: patch.due_date || null,
          parent_task_id: action.parent_task_id,
          category_id: parent.category_id,
          subcategory_id: parent.subcategory_id,
          outcome_ids:
            Array.isArray(patch.outcome_ids) && patch.outcome_ids.length > 0
              ? patch.outcome_ids
              : parent.outcome_ids || [],
          primary_life_domain: patch.primary_life_domain || parent.primary_life_domain || null,
          life_domains:
            Array.isArray(patch.life_domains) && patch.life_domains.length > 0
              ? patch.life_domains
              : parent.life_domains || [],
          alignment_source:
            patch.primary_life_domain ||
            (Array.isArray(patch.outcome_ids) && patch.outcome_ids.length > 0) ||
            parent.primary_life_domain ||
            (Array.isArray(parent.outcome_ids) && parent.outcome_ids.length > 0)
              ? "ai"
              : null,
        };
        const created = await createTaskCollaborative(userId, createPayload);
        if (Array.isArray(patch.tags) && patch.tags.length > 0) {
          await setTaskTagsCollaborative(userId, created.id, patch.tags);
        }
        await logTaskEvent(userId, action.parent_task_id, {
          source: EXTERNAL_PROJECT_IMPORT_SOURCE,
          action: "subtask_created",
          action_id: actionId,
          run_id: run.id,
          created_task_id: created.id,
        });
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.apply_patch.create_task && action.category_id) {
        const patch = action.apply_patch.create_task;
        const createPayload = {
          title: patch.title,
          status: patch.status || "todo",
          priority: patch.priority || "Medium",
          effort_hours: patch.effort_hours ?? null,
          due_date: patch.due_date || null,
          category_id: action.category_id,
          outcome_ids: patch.outcome_ids || [],
          primary_life_domain: patch.primary_life_domain || null,
          life_domains: patch.life_domains || [],
          alignment_source:
            patch.primary_life_domain || (Array.isArray(patch.outcome_ids) && patch.outcome_ids.length > 0)
              ? "ai"
              : null,
        };
        const created = await createTaskCollaborative(userId, createPayload);
        if (Array.isArray(patch.tags) && patch.tags.length > 0) {
          await setTaskTagsCollaborative(userId, created.id, patch.tags);
        }
        await logTaskEvent(userId, created.id, {
          source: EXTERNAL_PROJECT_IMPORT_SOURCE,
          action: "root_task_created",
          action_id: actionId,
          run_id: run.id,
        });
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.apply_patch.vision) {
        profile = applyVisionPatch(profile, { id: action.id, ...action.apply_patch.vision }, run.category_id);
        profileDirty = true;
        appliedActionIds.push(actionId);
        continue;
      }

      // Reorder root tasks
      if (action.apply_patch.reorder_tasks && run.category_id) {
        const orderIds = (action.apply_patch.reorder_tasks || []).map(String).filter(Boolean);
        await saveSharedProjectWorkspace(userId, run.category_id, { task_order_ids: orderIds });
        appliedActionIds.push(actionId);
        continue;
      }

      // Reorder subtasks
      if (action.apply_patch.reorder_subtasks && action.parent_task_id && run.category_id) {
        const subIds = (action.apply_patch.reorder_subtasks || []).map(String).filter(Boolean);
        const { data: wsRow } = await supabase
          .from("shared_project_workspaces")
          .select("subtask_order_ids")
          .eq("category_id", run.category_id)
          .maybeSingle();
        const current = wsRow?.subtask_order_ids || {};
        current[action.parent_task_id] = subIds;
        await saveSharedProjectWorkspace(userId, run.category_id, { subtask_order_ids: current });
        appliedActionIds.push(actionId);
        continue;
      }

      // Set dependency (blocked-by tag)
      if (action.apply_patch.set_dependency && action.task_id && action.apply_patch.blocked_by_task_id) {
        const depTag = `blocked-by:${action.apply_patch.blocked_by_task_id}`;
        await mergeCollaborativeTagNames(userId, action.task_id, [depTag]);
        await logTaskEvent(userId, action.task_id, {
          source: EXTERNAL_PROJECT_IMPORT_SOURCE,
          action: "dependency_set",
          action_id: actionId,
          blocked_by: action.apply_patch.blocked_by_task_id,
        });
        appliedActionIds.push(actionId);
        continue;
      }

      // Knowledge base append
      if (action.apply_patch.knowledge_base_append && run.category_id) {
        const { data: kbRow } = await supabase
          .from("shared_project_workspaces")
          .select("knowledge_base")
          .eq("category_id", run.category_id)
          .maybeSingle();
        const currentKB = kbRow?.knowledge_base || "";
        const appendText = String(action.apply_patch.knowledge_base_append || "").trim();
        if (appendText) {
          await supabase
            .from("shared_project_workspaces")
            .upsert(
              { category_id: run.category_id, owner_user_id: userId, knowledge_base: currentKB + "\n\n" + appendText, updated_at: new Date().toISOString() },
              { onConflict: "category_id" }
            );
        }
        appliedActionIds.push(actionId);
        continue;
      }
    }

    if (profileDirty) {
      const { error: saveProfileErr } = await supabase
        .from("user_profile")
        .upsert({ user_id: userId, profile }, { onConflict: "user_id" });
      if (saveProfileErr) throw saveProfileErr;
    }

    const nextAccepted = normalizeIds([...(run.accepted_action_ids || []), ...acceptedActionIds]);
    const nextRejected = normalizeIds([...(run.rejected_action_ids || []), ...rejectedActionIds]);
    const nextApplied = normalizeIds([...(run.applied_action_ids || []), ...appliedActionIds]);

    const { data: updatedRun, error: updateRunErr } = await supabase
      .from("external_ai_import_runs")
      .update({
        status: nextApplied.length > 0 ? "applied" : "reviewed",
        accepted_action_ids: nextAccepted,
        rejected_action_ids: nextRejected,
        applied_action_ids: nextApplied,
        preview_metrics: {
          ...(run.preview_metrics || {}),
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

    // Auto-log to project knowledge base
    if (nextApplied.length > 0 && run.category_id) {
      try {
        const dateStr = new Date().toISOString().slice(0, 10);
        const sourceModel = run.source_model || "external AI";
        const logEntry = `\n\n[IMPORT LOG ${dateStr}] Applied ${nextApplied.length} action(s) from ${sourceModel} planning session. Accepted: ${nextAccepted.length}, Rejected: ${nextRejected.length}.`;

        const { data: wsRow } = await supabase
          .from("shared_project_workspaces")
          .select("knowledge_base")
          .eq("category_id", run.category_id)
          .maybeSingle();

        const currentKB = wsRow?.knowledge_base || "";
        await supabase
          .from("shared_project_workspaces")
          .upsert(
            {
              category_id: run.category_id,
              owner_user_id: userId,
              knowledge_base: currentKB + logEntry,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "category_id" }
          );
      } catch {
        // Non-critical — don't fail the import if KB log fails
      }
    }

    return res.json({
      ok: true,
      run: updatedRun,
      accepted_action_ids: nextAccepted,
      rejected_action_ids: nextRejected,
      applied_action_ids: nextApplied,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to apply external AI import.",
    });
  }
}
