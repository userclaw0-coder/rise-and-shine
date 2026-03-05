import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using service role key (server only!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Deterministic scoring settings
const PRIORITY_POINTS = { Critical: 50, High: 40, Medium: 30, Low: 20 };

function scoreTask(t, weightMap, stalenessDays = 0) {
  const pri = PRIORITY_POINTS[t.priority || "Medium"] || 30;
  const w = (weightMap[t.category] || 0) * 8;

  const stale = Math.min(3, stalenessDays / 7) * 5;
  const effort = t.effort_hours ? Math.min(6, t.effort_hours / 2) : 0;

  const tags = t.tags || [];
  const tagBoost =
    (tags.includes("quick-win") ? 6 : 0) +
    (tags.includes("high-leverage") ? 6 : 0) +
    (tags.includes("urgent") ? 4 : 0);

  const subBoost = t.parent_task_id ? 6 : 0;

  return pri + w + stale + tagBoost + subBoost - effort;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const { user_id, date, mode, force } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const today = date || new Date().toISOString().slice(0, 10);
    const chosenMode = mode || "Strategic Push";

    // Load settings rows (store weights in user_profile later; for now default)
    const baseWeights = {
      Business: 5,
      "Rental House": 4,
      Vehicles: 3,
      Home: 2,
      Boat: 1,
      Personal: 2,
    };

    // Load daily plan
    const { data: plan } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user_id)
      .eq("date", today)
      .maybeSingle();

    // Load queue if exists
    const queue = plan?.queue || [];

    // If not forcing and queue has 3 items, return it
    if (!force && Array.isArray(queue) && queue.length === 3) {
      return res.json({ ok: true, date: today, queue });
    }

    // Pull candidate tasks
    // (In a later version, join tags via task_tags → tags)
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id,title,priority,effort_hours,due_date,status,parent_task_id,category_id,subcategory_id")
      .eq("user_id", user_id)
      .in("status", ["todo", "doing"]);

    // You will probably have categories table; fetch names
    const { data: categories } = await supabase
      .from("categories")
      .select("id,name")
      .eq("user_id", user_id);

    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    // Pull tag links
    const { data: tagLinks } = await supabase
      .from("task_tags")
      .select("task_id, tag_id")
      .eq("user_id", user_id);

    const { data: tagRows } = await supabase
      .from("tags")
      .select("id,name")
      .eq("user_id", user_id);

    const tagMap = Object.fromEntries(tagRows.map(t => [t.id, t.name]));

    const tagsByTask = {};
    for (const link of tagLinks) {
      const name = tagMap[link.tag_id];
      if (!name) continue;
      tagsByTask[link.task_id] = tagsByTask[link.task_id] || [];
      tagsByTask[link.task_id].push(name);
    }

    // Exclude daily repeat tasks via category name
    const candidates = (tasks || [])
      .map(t => ({
        ...t,
        category: catMap[t.category_id] || "Unknown",
        tags: tagsByTask[t.id] || [],
      }))
      .filter(t => t.category !== "Daily Repeat")
      .filter(t => !t.tags.includes("blocked") && !t.tags.includes("waiting"));

    // TODO: stalenessDays from task_events; keep 0 for v1
    const scored = candidates
      .map(t => ({ t, score: scoreTask(t, baseWeights, 0) }))
      .sort((a, b) => b.score - a.score);

    // Pick Quick Win first
    const quick = scored.find(x =>
      x.t.tags.includes("quick-win") || (x.t.effort_hours && x.t.effort_hours <= 1)
    )?.t || scored[0]?.t;

    const used = new Set([quick?.id]);

    // High leverage second
    const leverage = scored.find(x =>
      !used.has(x.t.id) && x.t.tags.includes("high-leverage")
    )?.t || scored.find(x => !used.has(x.t.id))?.t;

    if (leverage) used.add(leverage.id);

    // Progress third (try different category)
    const progress =
      scored.find(x => !used.has(x.t.id) && x.t.category !== leverage?.category)?.t ||
      scored.find(x => !used.has(x.t.id))?.t;

    const newQueue = [
      { slot: 1, type: "Quick Win", task_id: quick?.id },
      { slot: 2, type: "High Leverage", task_id: leverage?.id },
      { slot: 3, type: "Progress", task_id: progress?.id },
    ].filter(x => x.task_id);

    // Upsert daily plan
    const payload = {
      user_id,
      date: today,
      mode: chosenMode,
      queue: newQueue,
      refilled_count: (plan?.refilled_count || 0) + 1,
      last_refilled_at: new Date().toISOString(),
    };

    await supabase.from("daily_plans").upsert(payload, { onConflict: "user_id,date" });

    return res.json({ ok: true, date: today, queue: newQueue });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
