import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server only
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Pick a cheaper model via env for low cost (recommended):
// PLANNER_MODEL=gpt-4.1-mini (or similar cheap model you have access to)
// If unset, this defaults to gpt-5.2 (may be overkill).
const MODEL = process.env.PLANNER_MODEL || "gpt-5.2";

function hashQueue(mode, queue) {
  const payload = JSON.stringify({
    mode,
    queue: (queue || []).map((q) => `${q.type}:${q.task_id}`),
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const { user_id, date } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const today = date || new Date().toISOString().slice(0, 10);

    // 1) Load daily plan
    const { data: plan, error: planErr } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user_id)
      .eq("date", today)
      .maybeSingle();

    if (planErr) throw planErr;
    if (!plan || !Array.isArray(plan.queue) || plan.queue.length !== 3) {
      return res.status(400).json({
        error: "No valid daily_plans.queue for today. Refill queue first.",
      });
    }

    const mode = plan.mode || "Strategic Push";
    const queueHash = hashQueue(mode, plan.queue);

    // 2) Cache check: if already refined for this exact queue, return cached
    const { data: cached, error: cacheErr } = await supabase
      .from("planner_cache")
      .select("ai_output")
      .eq("user_id", user_id)
      .eq("date", today)
      .eq("queue_hash", queueHash)
      .maybeSingle();

    if (cacheErr && cacheErr.code !== "PGRST116") throw cacheErr;
    if (cached?.ai_output) {
      return res.json({ ok: true, cached: true, queue_hash: queueHash, ai: cached.ai_output });
    }

    // 3) Pull only the 3 tasks in the queue (tiny context)
    const taskIds = plan.queue.map((q) => q.task_id);
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("id,title,priority,effort_hours,due_date,status,parent_task_id,category_id,subcategory_id")
      .eq("user_id", user_id)
      .in("id", taskIds);

    if (tasksErr) throw tasksErr;

    // Categories name map
    const { data: cats, error: catsErr } = await supabase
      .from("categories")
      .select("id,name")
      .eq("user_id", user_id);
    if (catsErr) throw catsErr;
    const catMap = Object.fromEntries((cats || []).map((c) => [c.id, c.name]));

    // Tags for those tasks only
    const { data: tagLinks, error: tlErr } = await supabase
      .from("task_tags")
      .select("task_id, tag_id")
      .eq("user_id", user_id)
      .in("task_id", taskIds);
    if (tlErr) throw tlErr;

    const { data: tagRows, error: trErr } = await supabase
      .from("tags")
      .select("id,name")
      .eq("user_id", user_id);
    if (trErr) throw trErr;
    const tagMap = Object.fromEntries((tagRows || []).map((t) => [t.id, t.name]));

    const tagsByTask = {};
    for (const link of tagLinks || []) {
      const name = tagMap[link.tag_id];
      if (!name) continue;
      tagsByTask[link.task_id] = tagsByTask[link.task_id] || [];
      tagsByTask[link.task_id].push(name);
    }

    const queueTasks = plan.queue.map((q) => {
      const t = tasks.find((x) => x.id === q.task_id);
      return {
        slot: q.slot,
        type: q.type,
        id: q.task_id,
        title: t?.title,
        priority: t?.priority,
        effort_hours: t?.effort_hours,
        due_date: t?.due_date,
        category: catMap[t?.category_id] || "Unknown",
        tags: tagsByTask[q.task_id] || [],
      };
    });

    // 4) Human needs (optional): latest weekly snapshot if you’ve implemented it; otherwise omit
    // If you don't have human_needs_weekly table yet, this will just be null.
    let needs = null;
    try {
      const { data: hn } = await supabase
        .from("human_needs_weekly")
        .select("*")
        .eq("user_id", user_id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      needs = hn?.scores || null;
    } catch {
      needs = null;
    }

    // 5) Build a *small* instruction + input payload (cost control)
    const instructions = `
You are Rise & Shine — a calm operator planning assistant.
Return ONLY valid JSON with:
- rewording suggestions for the 3 tasks (verb-first next actions)
- recommended tags to add (quick-win, high-leverage, urgent, blocked, waiting, deep, physical, low-energy)
- recommended effort_minutes (integer)
- up to 3 suggested subtasks (approval required)
- up to 2 automation opportunities (approval required)
Keep responses concise.
`;

    const input = {
      date: today,
      mode,
      human_needs_scores: needs,
      queue: queueTasks,
      quick_win_definition_minutes: 30,
      constraints_summary: "Keep tasks bite-sized; prefer clarity and low friction; do not auto-execute anything.",
      output_schema: {
        task_refinements: [
          {
            task_id: "uuid",
            suggested_title: "string",
            suggested_tags_add: ["string"],
            suggested_effort_minutes: 30,
          },
        ],
        suggested_subtasks_to_create: [
          {
            parent_task_id: "uuid",
            title: "string",
            tags: ["string"],
            estimated_minutes: 30,
          },
        ],
        automation_opportunities: [
          {
            title: "string",
            what_it_does: "string",
            benefit: "string",
            recommended_tooling: ["n8n", "OpenAI API", "Zapier"],
            permissions_needed: ["string"],
          },
        ],
      },
    };

    // 6) Call OpenAI (Responses API)
    const response = await openai.responses.create({
      model: MODEL,
      instructions,
      input: JSON.stringify(input),
    });

    const text = response.output_text || "";
    const parsed = safeJsonParse(text);

    if (!parsed) {
      // Store raw output for debugging, but return error
      return res.status(500).json({
        error: "AI returned non-JSON output. Try again or adjust model.",
        raw: text.slice(0, 2000),
      });
    }

    // 7) Cache result (so you don’t pay again)
    await supabase.from("planner_cache").insert({
      user_id,
      date: today,
      mode,
      queue_hash: queueHash,
      ai_output: parsed,
    });

    return res.json({ ok: true, cached: false, queue_hash: queueHash, ai: parsed });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
