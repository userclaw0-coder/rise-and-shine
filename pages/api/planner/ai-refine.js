import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

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

    const authenticatedUserId = await getAuthenticatedUserId(req);
    const { user_id: requestedUserId, date } = req.body || {};
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      return res.status(403).json({ error: "user_id does not match authenticated user" });
    }

    const userId = authenticatedUserId;
    const today = date || new Date().toISOString().slice(0, 10);

    const { data: plan, error: planErr } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", userId)
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

    const { data: cached, error: cacheErr } = await supabase
      .from("planner_cache")
      .select("ai_output")
      .eq("user_id", userId)
      .eq("date", today)
      .eq("queue_hash", queueHash)
      .maybeSingle();

    if (cacheErr && cacheErr.code !== "PGRST116") throw cacheErr;
    if (cached?.ai_output) {
      return res.json({ ok: true, cached: true, queue_hash: queueHash, ai: cached.ai_output });
    }

    const taskIds = plan.queue.map((q) => q.task_id);
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("id,title,priority,effort_hours,due_date,status,parent_task_id,category_id,subcategory_id")
      .eq("user_id", userId)
      .in("id", taskIds);

    if (tasksErr) throw tasksErr;

    const { data: cats, error: catsErr } = await supabase
      .from("categories")
      .select("id,name")
      .eq("user_id", userId);
    if (catsErr) throw catsErr;
    const catMap = Object.fromEntries((cats || []).map((c) => [c.id, c.name]));

    const { data: tagLinks, error: tlErr } = await supabase
      .from("task_tags")
      .select("task_id, tag_id")
      .eq("user_id", userId)
      .in("task_id", taskIds);
    if (tlErr) throw tlErr;

    const { data: tagRows, error: trErr } = await supabase
      .from("tags")
      .select("id,name")
      .eq("user_id", userId);
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

    let needs = null;
    try {
      const { data: hn } = await supabase
        .from("human_needs_weekly")
        .select("*")
        .eq("user_id", userId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      needs = hn?.scores || null;
    } catch {
      needs = null;
    }

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

    const response = await openai.responses.create({
      model: MODEL,
      instructions,
      input: JSON.stringify(input),
    });

    const text = response.output_text || "";
    const parsed = safeJsonParse(text);

    if (!parsed) {
      return res.status(500).json({
        error: "AI returned non-JSON output. Try again or adjust model.",
        raw: text.slice(0, 2000),
      });
    }

    await supabase.from("planner_cache").insert({
      user_id: userId,
      date: today,
      mode,
      queue_hash: queueHash,
      ai_output: parsed,
    });

    return res.json({ ok: true, cached: false, queue_hash: queueHash, ai: parsed });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
