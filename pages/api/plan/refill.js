import { createClient } from "@supabase/supabase-js";
import { chooseKeyOutcomes } from "../../../lib/scoring";
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

function buildQueueFromChosen(chosen) {
  const types = ["Quick Win", "High Leverage", "Progress"];
  return (chosen || []).slice(0, 3).map((entry, idx) => ({
    slot: idx + 1,
    type: types[idx] || "Progress",
    task_id: entry.task.id,
  }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const authenticatedUserId = await getAuthenticatedUserId(req);

    const {
      date,
      mode,
      force,
      base_category_weights,
      quick_win_minutes,
    } = req.body || {};

    const userId = authenticatedUserId;
    const today = date || new Date().toISOString().slice(0, 10);
    const chosenMode = mode || "Strategic Push";

    const { data: plan, error: planErr } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (planErr) throw planErr;

    const existingQueue = Array.isArray(plan?.queue) ? plan.queue : [];
    if (!force && existingQueue.length === 3) {
      return res.json({ ok: true, date: today, queue: existingQueue, reused: true });
    }

    const [
      tasks,
      categories,
      { data: completedEvents, error: compErr },
      { data: profileRow, error: profileErr },
    ] = await Promise.all([
      listBacklogTasksForActor(userId, { includeArchived: false }),
      listAccessibleCategoriesWithMeta(userId),
      supabase
        .from("task_events")
        .select("task_id,created_at,event_type")
        .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)
        .eq("event_type", "completed")
        .order("created_at", { ascending: false }),
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    ]);

    if (compErr) throw compErr;

    const profile = profileRow?.profile || {};
    const prefs = profile.preferences || {};
    const orderIds = prefs.category_order_ids;
    const hasOrder = Array.isArray(orderIds) && orderIds.length > 0;
    const derivedWeights = {};
    if (hasOrder && categories?.length) {
      for (let i = 0; i < orderIds.length; i++) {
        const cat = (categories || []).find((c) => c.id === orderIds[i]);
        if (cat) derivedWeights[cat.name] = Math.max(1, orderIds.length - i);
      }
    }
    const effectiveWeights =
      Object.keys(derivedWeights).length > 0
        ? { ...(base_category_weights || prefs.base_category_weights || {}), ...derivedWeights }
        : base_category_weights || prefs.base_category_weights;

    const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));

    const lastCompletedMap = {};
    for (const ev of completedEvents || []) {
      if (!lastCompletedMap[ev.task_id]) {
        lastCompletedMap[ev.task_id] = ev.created_at;
      }
    }

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
    const filtered = withMeta
      .filter((t) => t.category !== "Daily Repeat")
      .filter((t) => !t.tags.includes("blocked") && !t.tags.includes("waiting"));
    const reduced = reduceParentsToBestSubtask(filtered, {
      dailyTemplateTaskIds: [],
      mode: chosenMode,
      now: new Date(),
      lastCompletedMap,
      baseCategoryWeights: effectiveWeights,
      quickWinMinutes: quick_win_minutes ?? prefs.quick_win_definition_minutes,
    });

    const chosen = chooseKeyOutcomes(reduced, {
      mode: chosenMode,
      todayStr: today,
      lastCompletedMap,
      baseCategoryWeights: effectiveWeights,
      quickWinMinutes: quick_win_minutes ?? prefs.quick_win_definition_minutes,
    });

    const newQueue = buildQueueFromChosen(chosen);
    const payload = {
      user_id: userId,
      date: today,
      mode: chosenMode,
      queue: newQueue,
      refilled_count: (plan?.refilled_count || 0) + 1,
      last_refilled_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("daily_plans")
      .upsert(payload, { onConflict: "user_id,date" });
    if (upErr) throw upErr;

    return res.json({ ok: true, date: today, queue: newQueue, reused: false });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
