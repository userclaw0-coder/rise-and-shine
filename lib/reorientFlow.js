// lib/reorientFlow.js — server-side orchestration for the Reorient flow.
//
// Phase A (user-level): handled by pages/reorient.js + OnboardingEngine.
// Phase B (per-project): this file + components/ReorientProjectWizard.js +
//                        pages/reorient/[categoryId].js.
//
// Public surface:
//   getReorientQueue(userId, opts)
//     -> ordered list of projects to walk; uses preferences.category_order_ids
//        as the priority order, decorates with last_reorient_at + staleness.
//
//   getProjectReorientState(userId, categoryId)
//     -> everything the wizard needs: workspace fields, open tasks with
//        their current phase, recent completions for the status snapshot.
//
//   applyProjectReorient(userId, categoryId, payload)
//     -> writes mantra/narrative/kb/resources/mode + applies triage
//        decisions in one pass, stamps workspace.last_reorient_at.

// This file is server-only. It calls createClient with the service-role
// key, which must never reach the browser. The wizard imports its UI
// constants from lib/reorientConstants.js instead.

import { createClient } from "@supabase/supabase-js";
import { STALE_THRESHOLD_DAYS } from "./reorientConstants.js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

/**
 * Build the reorient queue for a user: projects in priority order with
 * staleness metadata, ready for the Phase A→B handoff or the standalone
 * "Reorient this project" button on the project page.
 *
 * @returns Array<{
 *   category_id, name, open_count, last_reorient_at, days_since,
 *   is_stale, is_active, priority_rank
 * }>
 */
export async function getReorientQueue(userId, { staleAfterDays = STALE_THRESHOLD_DAYS } = {}) {
  if (!userId) throw new Error("userId required");

  const [profileRes, catsRes, wsRes, tasksRes] = await Promise.all([
    supabaseAdmin
      .from("user_profile")
      .select("profile")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("categories")
      .select("id, name, is_active")
      .eq("user_id", userId),
    supabaseAdmin
      .from("shared_project_workspaces")
      .select("category_id, workspace")
      .eq("owner_user_id", userId),
    supabaseAdmin
      .from("tasks")
      .select("id, category_id, status")
      .eq("user_id", userId)
      .is("archived_at", null)
      .in("status", ["todo", "doing"]),
  ]);

  const order = profileRes.data?.profile?.preferences?.category_order_ids || [];
  const cats = catsRes.data || [];
  const wsByCat = new Map();
  for (const row of wsRes.data || []) {
    wsByCat.set(row.category_id, row.workspace || {});
  }
  const openByCat = new Map();
  for (const t of tasksRes.data || []) {
    openByCat.set(t.category_id, (openByCat.get(t.category_id) || 0) + 1);
  }

  // Stable ordering: preferences.category_order_ids first, then newcomers by name.
  const orderedIds = order.filter((id) => cats.some((c) => c.id === id));
  const newcomers = cats
    .map((c) => c.id)
    .filter((id) => !orderedIds.includes(id));
  const finalOrder = [...orderedIds, ...newcomers];

  return finalOrder
    .map((id, i) => {
      const cat = cats.find((c) => c.id === id);
      if (!cat) return null;
      const ws = wsByCat.get(id) || {};
      const lastIso = ws.last_reorient_at || ws.last_aligned_at || null;
      const d = daysSince(lastIso);
      return {
        category_id: id,
        name: cat.name,
        is_active: cat.is_active !== false,
        priority_rank: i + 1,
        open_count: openByCat.get(id) || 0,
        last_reorient_at: lastIso,
        days_since: Number.isFinite(d) ? d : null,
        is_stale: d > staleAfterDays,
      };
    })
    .filter(Boolean);
}

/**
 * Load all data the wizard needs for one project.
 */
export async function getProjectReorientState(userId, categoryId) {
  if (!userId || !categoryId) throw new Error("userId and categoryId required");

  const [catRes, wsRes, tasksRes, recentDoneRes] = await Promise.all([
    supabaseAdmin
      .from("categories")
      .select("id, name")
      .eq("id", categoryId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("shared_project_workspaces")
      .select("workspace, knowledge_base")
      .eq("category_id", categoryId)
      .eq("owner_user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, effort_hours, due_date, phase, parent_task_id, created_at, updated_at")
      .eq("user_id", userId)
      .eq("category_id", categoryId)
      .is("archived_at", null)
      .in("status", ["todo", "doing"])
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("task_events")
      .select("created_at, value, tasks(title)")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (catRes.error || !catRes.data) {
    throw new Error("Project not found");
  }
  const ws = wsRes.data?.workspace || {};
  return {
    category: catRes.data,
    mantra: ws.mantra || "",
    narrative: ws.narrative || "",
    knowledge_base: wsRes.data?.knowledge_base || "",
    resources: ws.resources || [],
    mode: ws.mode || null,
    last_reorient_at: ws.last_reorient_at || null,
    last_aligned_at: ws.last_aligned_at || null,
    tasks: tasksRes.data || [],
    recent_completions: (recentDoneRes.data || []).map((e) => ({
      title: e.tasks?.title || null,
      completed_at: e.created_at,
    })),
  };
}

/**
 * Apply one Reorient pass for a project.
 *
 * @param userId
 * @param categoryId
 * @param payload.mantra            new mantra (or undefined to leave alone)
 * @param payload.narrative
 * @param payload.knowledge_base
 * @param payload.resources         full array of resource objects
 * @param payload.mode              pushing | steady | maintenance | paused | null
 * @param payload.decisions         [{task_id, action: 'done'|'archive'|'keep', phase?}]
 * @returns { workspace_updated, decisions_applied, errors }
 */
export async function applyProjectReorient(userId, categoryId, payload = {}) {
  if (!userId || !categoryId) throw new Error("userId and categoryId required");

  const errors = [];
  const nowIso = new Date().toISOString();

  // 1. Load existing workspace so we merge instead of overwrite.
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("shared_project_workspaces")
    .select("workspace, knowledge_base")
    .eq("category_id", categoryId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existingErr) {
    throw new Error(`Failed to load workspace: ${existingErr.message}`);
  }

  const currentWs = existing?.workspace || {};
  const nextWs = { ...currentWs };
  if (typeof payload.mantra === "string") nextWs.mantra = payload.mantra;
  if (typeof payload.narrative === "string") nextWs.narrative = payload.narrative;
  if (Array.isArray(payload.resources)) nextWs.resources = payload.resources;
  if (payload.mode !== undefined) nextWs.mode = payload.mode;
  nextWs.last_reorient_at = nowIso;

  const wsRow = {
    category_id: categoryId,
    owner_user_id: userId,
    workspace: nextWs,
    knowledge_base:
      typeof payload.knowledge_base === "string"
        ? payload.knowledge_base
        : existing?.knowledge_base || "",
    updated_at: nowIso,
  };

  const { error: wsErr } = await supabaseAdmin
    .from("shared_project_workspaces")
    .upsert(wsRow, { onConflict: "category_id" });
  if (wsErr) {
    throw new Error(`Failed to save workspace: ${wsErr.message}`);
  }

  // 2. Apply task decisions.
  let applied = 0;
  const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
  for (const d of decisions) {
    if (!d?.task_id) continue;
    try {
      if (d.action === "done") {
        const { error } = await supabaseAdmin
          .from("tasks")
          .update({ status: "done", updated_at: nowIso })
          .eq("id", d.task_id)
          .eq("user_id", userId);
        if (error) throw error;
        await supabaseAdmin.from("task_events").insert({
          user_id: userId,
          task_id: d.task_id,
          event_type: "completed",
          value: { source: "reorient" },
        });
        applied += 1;
      } else if (d.action === "archive") {
        const { error } = await supabaseAdmin
          .from("tasks")
          .update({ archived_at: nowIso, updated_at: nowIso })
          .eq("id", d.task_id)
          .eq("user_id", userId);
        if (error) throw error;
        await supabaseAdmin.from("task_events").insert({
          user_id: userId,
          task_id: d.task_id,
          event_type: "archived",
          value: { source: "reorient" },
        });
        applied += 1;
      } else if (d.action === "keep") {
        const patch = { updated_at: nowIso };
        if (d.phase === null || typeof d.phase === "string") {
          patch.phase = d.phase || null;
        }
        const { error } = await supabaseAdmin
          .from("tasks")
          .update(patch)
          .eq("id", d.task_id)
          .eq("user_id", userId);
        if (error) throw error;
        applied += 1;
      }
    } catch (err) {
      errors.push({ task_id: d.task_id, error: err.message || String(err) });
    }
  }

  return {
    workspace_updated: true,
    decisions_applied: applied,
    decisions_total: decisions.length,
    errors,
  };
}

// Re-exports for any server-side callers that still want them from here.
export { REORIENT_PHASES, REORIENT_MODES } from "./reorientConstants.js";
