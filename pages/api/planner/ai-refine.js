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
const MODEL = process.env.PLANNER_MODEL || "gpt-4.1-mini";
const AI_TIMEOUT_MS = 25000;
const PLANNER_PROMPT_VERSION = "planner_refine_v1";

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
    const match = String(text || "").match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function withTimeout(promise, timeoutMs) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("planner_ai_timeout")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

const SLOT_WHY_FALLBACKS = [
  "Quick win — low friction so you build momentum.",
  "High leverage — moves the needle on what matters most.",
  "Progress — keeps you advancing on a key area.",
];

function buildFallbackPlannerResponse(queueTasks) {
  const taskRefinements = (queueTasks || []).map((task, idx) => {
    const tags = Array.isArray(task.tags) ? task.tags : [];
    const extraTags = [];
    if ((task.effort_hours ?? 0) > 0 && task.effort_hours <= 0.5 && !tags.includes('quick-win')) extraTags.push('quick-win');
    if (/email|call|follow up|review|confirm|send/i.test(String(task.title || '')) && !tags.includes('quick-win')) extraTags.push('quick-win');
    if (/plan|brief|system|automation|brand|strategy/i.test(String(task.title || '')) && !tags.includes('high-leverage')) extraTags.push('high-leverage');
    if (task.due_date && !tags.includes('urgent')) extraTags.push('urgent');
    return {
      task_id: task.id,
      suggested_title: String(task.title || '').trim(),
      suggested_tags_add: Array.from(new Set(extraTags)).slice(0, 3),
      suggested_effort_minutes: Math.max(15, Math.round(((task.effort_hours || 0.5) * 60) / 5) * 5),
      why_this_task_now: SLOT_WHY_FALLBACKS[idx] || SLOT_WHY_FALLBACKS[2],
    };
  });

  return {
    task_refinements: taskRefinements,
    suggested_subtasks_to_create: [],
    automation_opportunities: [],
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    let authenticatedUserId;
    try {
      authenticatedUserId = await getAuthenticatedUserId(req);
    } catch (authErr) {
      const status = authErr.status ?? 401;
      return res.status(status).json({
        error: status === 401 ? "Authentication required" : authErr.message,
      });
    }
    const { date } = req.body || {};

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
      return res.json({
        ok: true,
        cached: true,
        queue_hash: queueHash,
        ai: cached.ai_output,
        meta: {
          prompt_version: PLANNER_PROMPT_VERSION,
          model: MODEL,
        },
      });
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
- for each task, why_this_task_now: one short sentence (under 100 chars) explaining why this task is in this slot today — e.g. quick win for momentum, high leverage for impact, or progress on a key area
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
            why_this_task_now: "string (one short sentence why this task is in this slot today)",
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

    const apiKey = process.env.OPENAI_API_KEY;
    let text = "";
    if (apiKey && apiKey.trim()) {
      try {
        const response = await withTimeout(
          openai.responses.create({
            model: MODEL,
            instructions,
            input: JSON.stringify(input),
          }),
          AI_TIMEOUT_MS
        );
        text = response.output_text || "";
      } catch (openaiErr) {
        const msg = openaiErr?.message || String(openaiErr);
        if (openaiErr?.status === 401 || /invalid.*api.*key|authentication|unauthorized/i.test(msg)) {
          return res.status(502).json({
            error: "OpenAI authentication failed. Check OPENAI_API_KEY in server environment.",
          });
        }
        throw openaiErr;
      }
    }

    const parsed = safeJsonParse(text);
    const finalOutput = parsed || buildFallbackPlannerResponse(queueTasks);
    const fallbackReason = !(apiKey && apiKey.trim()) ? "no_api_key" : null;
    const aiStatus = parsed ? "ok" : (fallbackReason ? `fallback:${fallbackReason}` : "fallback:non_json");

    const { error: cacheWriteErr } = await supabase.from("planner_cache").upsert({
      user_id: userId,
      date: today,
      mode,
      queue_hash: queueHash,
      ai_output: finalOutput,
    }, { onConflict: "user_id,date,queue_hash" });
    if (cacheWriteErr) throw cacheWriteErr;

    return res.json({
      ok: true,
      cached: false,
      queue_hash: queueHash,
      ai: finalOutput,
      ai_status: aiStatus,
      meta: {
        prompt_version: PLANNER_PROMPT_VERSION,
        model: MODEL,
      },
    });
  } catch (e) {
    const message = e?.message || String(e);
    if (message === "planner_ai_timeout") {
      return res.json({
        ok: true,
        cached: false,
        ai_status: "fallback:timeout",
        ai: buildFallbackPlannerResponse([]),
        meta: {
          prompt_version: PLANNER_PROMPT_VERSION,
          model: MODEL,
        },
      });
    }
    return res.status(e.status || 500).json({
      error: message,
    });
  }
}
