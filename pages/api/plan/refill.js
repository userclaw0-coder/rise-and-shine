import { createClient } from "@supabase/supabase-js";
import { chooseKeyOutcomes } from "../../../lib/scoring";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

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
      { data: tasks, error: tasksErr },
      { data: categories, error: catsErr },
      { data: tagLinks, error: linksErr },
      { data: tagRows, error: tagsErr },
      { data: completedEvents, error: compErr },
      { data: profileRow, error: profileErr },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,priority,effort_hours,due_date,status,parent_task_id,category_id,subcategory_id")
        .eq("user_id", userId)
        .in("status", ["todo", "doing"]),
      supabase.from("categories").select("id,name").eq("user_id", userId),
      supabase.from("task_tags").select("task_id, tag_id").eq("user_id", userId),
      supabase.from("tags").select("id,name").eq("user_id", userId),
      supabase
        .from("task_events")
        .select("task_id,created_at,event_type")
        .eq("user_id", userId)
        .eq("event_type", "completed")
        .order("created_at", { ascending: false }),
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    ]);

    if (tasksErr) throw tasksErr;
    if (catsErr) throw catsErr;
    if (linksErr) throw linksErr;
    if (tagsErr) throw tagsErr;
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
    const tagMap = Object.fromEntries((tagRows || []).map((t) => [t.id, t.name]));

    const tagsByTask = {};
    for (const link of tagLinks || []) {
      const name = tagMap[link.tag_id];
      if (!name) continue;
      tagsByTask[link.task_id] = tagsByTask[link.task_id] || [];
      tagsByTask[link.task_id].push(name);
    }

    const lastCompletedMap = {};
    for (const ev of completedEvents || []) {
      if (!lastCompletedMap[ev.task_id]) {
        lastCompletedMap[ev.task_id] = ev.created_at;
      }
    }

    const candidates = (tasks || [])
      .map((t) => ({
        ...t,
        category: catMap[t.category_id] || "Unknown",
        tags: tagsByTask[t.id] || [],
      }))
      .filter((t) => t.category !== "Daily Repeat")
      .filter((t) => !t.tags.includes("blocked") && !t.tags.includes("waiting"));

    const chosen = chooseKeyOutcomes(candidates, {
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
