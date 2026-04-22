// Per-project "Next ≤30m action" auto-refill.
//
// The project workspace stores a next_action block. When the task that
// block points at is completed, we silently promote the next best
// candidate from the project's open tasks so the user never sees an empty
// slot. If nothing ≤30m exists, we still write a candidate but flag it
// needs_breakdown so Morning Approvals can propose a breakdown next day.

import { createClient } from "@supabase/supabase-js";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRIORITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const DEFAULT_EFFORT = 0.5; // tasks with null effort are treated as small-ish

function rankTask(a, b) {
  const ap = PRIORITY_RANK[a.priority] ?? 2;
  const bp = PRIORITY_RANK[b.priority] ?? 2;
  if (ap !== bp) return bp - ap; // higher priority first
  const ae = a.effort_hours == null ? DEFAULT_EFFORT : Number(a.effort_hours);
  const be = b.effort_hours == null ? DEFAULT_EFFORT : Number(b.effort_hours);
  if (ae !== be) return ae - be; // smaller effort first
  const ac = a.created_at || "";
  const bc = b.created_at || "";
  return ac.localeCompare(bc); // older first
}

/**
 * Pure ranker — pick the top candidate from a category's open tasks.
 * Returns { task, needs_breakdown } or null.
 */
export async function pickNextAction(userId, categoryId, { excludeTaskId } = {}) {
  if (!userId || !categoryId) return null;
  const { data: rows, error } = await serviceSupabase
    .from("tasks")
    .select(
      "id, title, status, priority, effort_hours, created_at, parent_task_id, archived_at"
    )
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .in("status", ["todo", "doing"])
    .is("archived_at", null);
  if (error) return null;

  const candidates = (rows || []).filter((r) => r.id !== excludeTaskId);
  if (candidates.length === 0) return null;

  candidates.sort(rankTask);
  const top = candidates[0];
  const effort = top.effort_hours == null ? DEFAULT_EFFORT : Number(top.effort_hours);
  return {
    task: top,
    needs_breakdown: effort > 0.5,
  };
}

/**
 * Orchestrator: idempotent. If the completed task matches the project's
 * stored next_action.task_id, picks a replacement and writes it.
 */
export async function autoRefillAfterCompletion(userId, completedTaskId) {
  if (!userId || !completedTaskId) return { skipped: true };

  try {
    // 1. Find the completed task's category.
    const { data: task, error: taskErr } = await serviceSupabase
      .from("tasks")
      .select("id, category_id")
      .eq("id", completedTaskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (taskErr || !task?.category_id) return { skipped: true };
    const categoryId = task.category_id;

    // 2. Read the current workspace.
    const { data: ws, error: wsErr } = await serviceSupabase
      .from("shared_project_workspaces")
      .select("category_id, workspace, legacy_links, knowledge_base, task_order_ids, subtask_order_ids, owner_user_id")
      .eq("category_id", categoryId)
      .maybeSingle();
    if (wsErr || !ws) return { skipped: true };
    const currentWorkspace = ws.workspace && typeof ws.workspace === "object" ? ws.workspace : {};
    const currentNext = currentWorkspace.next_action;

    // 3. Only refill if the completed task was the active next_action.
    if (!currentNext || currentNext.task_id !== completedTaskId) {
      return { skipped: true, reason: "not_active_next_action" };
    }

    // 4. Pick the replacement.
    const pick = await pickNextAction(userId, categoryId, { excludeTaskId: completedTaskId });

    const now = new Date().toISOString();
    let nextAction = null;
    if (pick) {
      const effortH = pick.task.effort_hours == null ? DEFAULT_EFFORT : Number(pick.task.effort_hours);
      nextAction = {
        title: pick.task.title,
        minutes: Math.max(5, Math.round(effortH * 60)),
        why: "",
        task_id: pick.task.id,
        set_at: now,
        source: "auto_refill",
        needs_breakdown: !!pick.needs_breakdown,
      };
    }

    // 5. Write back, preserving every other workspace key.
    const nextWorkspace = { ...currentWorkspace, next_action: nextAction };
    const { error: upErr } = await serviceSupabase
      .from("shared_project_workspaces")
      .upsert(
        {
          category_id: categoryId,
          owner_user_id: ws.owner_user_id,
          workspace: nextWorkspace,
          legacy_links: ws.legacy_links || "",
          knowledge_base: ws.knowledge_base || "",
          task_order_ids: ws.task_order_ids || [],
          subtask_order_ids: ws.subtask_order_ids || {},
          updated_at: now,
        },
        { onConflict: "category_id" }
      );
    if (upErr) return { skipped: true, reason: "write_failed" };

    return { refilled: true, next_action: nextAction };
  } catch {
    return { skipped: true, reason: "exception" };
  }
}
