// POST /api/today/regenerate-slot
// Body: { date?, mode?, slot_index }  (slot_index: 0|1|2)
// Returns: { ok, queue, replaced_slot }
//
// Swaps out a single slot in today's queue for the next-best candidate,
// avoiding (when possible) the same category as the slot being regenerated
// so the user is naturally rotated toward a different vector. Falls back
// to allowing same-category if no cross-category candidate exists.

import { createClient } from "@supabase/supabase-js";
import { buildRationale, computeTaskScore } from "../../../lib/scoring";
import { reduceParentsToBestSubtask } from "../../../lib/today-queue";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  listAccessibleCategoriesWithMeta,
  listBacklogTasksForActor,
} from "../../../lib/projectCollaboration";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildOutcomeIscState(profile) {
  const map = new Map();
  const outcomes = Array.isArray(profile?.desired_outcomes)
    ? profile.desired_outcomes
    : [];
  for (const o of outcomes) {
    if (!o?.id) continue;
    const criteria = Array.isArray(o.criteria) ? o.criteria : [];
    map.set(String(o.id), {
      unmetCount: criteria.filter((c) => !c?.met).length,
      totalCount: criteria.length,
    });
  }
  return map;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const slotIndex = Number(req.body?.slot_index);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
    return res.status(400).json({ error: "slot_index must be 0, 1, or 2" });
  }
  const today = req.body?.date || new Date().toISOString().slice(0, 10);
  const chosenMode = req.body?.mode || "Strategic Push";

  try {
    const { data: plan, error: planErr } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (planErr) throw planErr;
    const currentQueue = Array.isArray(plan?.queue) ? plan.queue : [];
    if (currentQueue.length === 0) {
      return res.status(404).json({ error: "No queue for this date." });
    }
    const oldSlot = currentQueue[slotIndex];
    if (!oldSlot) {
      return res.status(404).json({ error: "Slot is empty." });
    }

    const [
      tasks,
      categories,
      { data: completedEvents },
      { data: profileRow },
      { data: workspaceRows },
    ] = await Promise.all([
      listBacklogTasksForActor(userId, { includeArchived: false }),
      listAccessibleCategoriesWithMeta(userId),
      supabase
        .from("task_events")
        .select("task_id,created_at,event_type")
        .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)
        .eq("event_type", "completed")
        .order("created_at", { ascending: false }),
      supabase
        .from("user_profile")
        .select("profile")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("shared_project_workspaces")
        .select("category_id, workspace")
        .eq("owner_user_id", userId),
    ]);

    const profile = profileRow?.profile || {};
    const prefs = profile.preferences || {};

    const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));
    const lastCompletedMap = {};
    const todayCompletedIds = new Set();
    for (const ev of completedEvents || []) {
      if (!lastCompletedMap[ev.task_id]) lastCompletedMap[ev.task_id] = ev.created_at;
      if (ev.created_at?.slice(0, 10) === today) todayCompletedIds.add(ev.task_id);
    }

    const orderIds = prefs.category_order_ids;
    const derivedWeights = {};
    if (Array.isArray(orderIds) && orderIds.length > 0 && categories?.length) {
      for (let i = 0; i < orderIds.length; i++) {
        const cat = (categories || []).find((c) => c.id === orderIds[i]);
        if (cat) derivedWeights[cat.name] = Math.max(1, orderIds.length - i);
      }
    }
    const effectiveWeights =
      Object.keys(derivedWeights).length > 0
        ? { ...(prefs.base_category_weights || {}), ...derivedWeights }
        : prefs.base_category_weights;

    const withMeta = (tasks || []).map((t) => ({
      ...t,
      category:
        (typeof t.category === "string" ? t.category : t.category?.name) ||
        catMap[t.category_id] ||
        "Unknown",
      tags: Array.isArray(t.tags)
        ? t.tags
            .map((tag) => (typeof tag === "string" ? tag : tag?.tag?.name || tag?.name || ""))
            .filter(Boolean)
        : [],
    }));

    // Exclude every task currently in the queue (no duplicates) and tasks
    // completed today.
    const usedTaskIds = new Set(currentQueue.map((s) => s.task_id));
    const baseFiltered = withMeta
      .filter((t) => t.status !== "done" && t.status !== "archived")
      .filter((t) => !todayCompletedIds.has(t.id))
      .filter((t) => t.category !== "Daily Repeat")
      .filter((t) => !t.tags.includes("blocked") && !t.tags.includes("waiting"))
      .filter((t) => !usedTaskIds.has(t.id));

    // Cross-project arbiter signals (same shape as /api/plan/refill).
    const nextActionTaskIds = new Set();
    const staleProjectCategoryIds = new Set();
    const THIRTY_DAYS_MS = 30 * 86400 * 1000;
    for (const row of workspaceRows || []) {
      const ws = row.workspace || {};
      if (ws.next_action?.task_id) nextActionTaskIds.add(ws.next_action.task_id);
      const alignedAt = ws.last_aligned_at ? new Date(ws.last_aligned_at).getTime() : 0;
      if (!alignedAt || Date.now() - alignedAt > THIRTY_DAYS_MS) {
        staleProjectCategoryIds.add(String(row.category_id));
      }
    }
    const quarterFocusOutcomeIds = new Set(
      Array.isArray(profile.quarter_focus) ? profile.quarter_focus.map(String) : []
    );
    const dailyCap = prefs.daily_capacity || {};
    const capacity = dailyCap[today] || "normal";
    const activeSituations = Array.isArray(prefs.life_situations)
      ? prefs.life_situations.filter((s) => !s.archived_at)
      : [];
    const lifeSituationKeywords = new Set();
    for (const s of activeSituations) {
      const parts = String(s.label || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);
      for (const w of parts) lifeSituationKeywords.add(w);
    }

    const scoringOptions = {
      mode: chosenMode,
      now: new Date(),
      lastCompletedMap,
      baseCategoryWeights: effectiveWeights,
      quickWinMinutes: prefs.quick_win_definition_minutes,
      nextActionTaskIds,
      quarterFocusOutcomeIds,
      capacity,
      lifeSituationKeywords,
      staleProjectCategoryIds,
      outcomeIscState: buildOutcomeIscState(profile),
    };

    const reduced = reduceParentsToBestSubtask(baseFiltered, {
      dailyTemplateTaskIds: [],
      ...scoringOptions,
    });

    // Score every remaining candidate and pick the highest. We don't use
    // chooseKeyOutcomes here because that function shapes a 3-slot
    // Quick-Win / High-Leverage / Progress mix — we just want the best
    // single replacement for one slot.
    const oldCategoryId =
      withMeta.find((t) => t.id === oldSlot.task_id)?.category_id || null;

    const scoreOne = (t) => ({
      task: t,
      scoring: computeTaskScore(t, scoringOptions),
    });
    const allScored = reduced.map(scoreOne);

    const pickTop = (excludeCatId) => {
      const pool = excludeCatId
        ? allScored.filter(
            (e) => String(e.task.category_id) !== String(excludeCatId)
          )
        : allScored;
      if (pool.length === 0) return null;
      pool.sort((a, b) => b.scoring.score - a.scoring.score);
      return pool[0];
    };

    let pick = pickTop(oldCategoryId);
    let rotatedVector = !!pick;
    if (!pick) {
      pick = pickTop(null);
      rotatedVector = false;
    }
    if (!pick) {
      return res.status(404).json({ error: "No replacement candidate." });
    }

    const why = buildRationale(
      pick.task,
      { components: pick.scoring.components },
      chosenMode
    );

    const replaced = {
      slot: oldSlot.slot,
      type: oldSlot.type,
      task_id: pick.task.id,
      why,
    };
    const newQueue = currentQueue.map((s, i) => (i === slotIndex ? replaced : s));

    const { error: upErr } = await supabase
      .from("daily_plans")
      .upsert(
        {
          user_id: userId,
          date: today,
          mode: chosenMode,
          queue: newQueue,
          last_refilled_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" }
      );
    if (upErr) throw upErr;

    return res.json({
      ok: true,
      date: today,
      queue: newQueue,
      replaced_slot: replaced,
      rotated_vector: rotatedVector,
    });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.message || String(e) });
  }
}
