// POST /api/coach/task-dna
// Body: { task_id }
// Returns: { ok, proposed: { outcome_ids, primary_life_domain, type_tag,
//                             effort_bucket, rationale } }
// Coach proposes the four Task DNA tags for a task. User accepts each
// field individually (trust, not autopilot).

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TYPE_TAGS = ["quick-win", "high-leverage", "progress", "maintenance"];
const EFFORT_BUCKETS = ["XS", "S", "M", "L"];

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
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

  const taskId = String(req.body?.task_id || "");
  if (!taskId) return res.status(400).json({ error: "task_id required" });

  try {
    const { data: task } = await supabase
      .from("tasks")
      .select(
        "id, title, priority, effort_hours, category:categories(name)"
      )
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!task) return res.status(404).json({ error: "Task not found" });

    const system = `You are the Rise & Shine task-tagging coach. Propose the TASK-LEVEL DNA — Type and Size — for a single task. (Outcomes and Human Need are set at the project level and inherited by every task under a project, so you don't propose those here.)

1. type_tag: exactly one of quick-win / high-leverage / progress / maintenance. Quick-win = ≤15 min, visible lift. High-leverage = compounds across projects. Progress = incremental steady move. Maintenance = keeps things running, not new ground.
2. effort_bucket: XS (≤15 min), S (15-30 min), M (30-90 min), L (>90 min — needs breakdown).

Return strict JSON:
{"type_tag":"…","effort_bucket":"…","rationale":"one short sentence explaining your picks"}
No prose outside JSON.`;

    const userPrompt = `Task: "${task.title}"
Project: ${task.category?.name || "—"}
Priority: ${task.priority || "Medium"}
Current effort: ${task.effort_hours ? `${Math.round(task.effort_hours * 60)} min` : "unknown"}

Propose DNA and return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    if (!parsed) return res.status(502).json({ error: "AI returned invalid JSON." });

    const proposed = {
      type_tag: TYPE_TAGS.includes(parsed.type_tag) ? parsed.type_tag : null,
      effort_bucket: EFFORT_BUCKETS.includes(
        String(parsed.effort_bucket || "").toUpperCase()
      )
        ? String(parsed.effort_bucket).toUpperCase()
        : null,
      rationale: String(parsed.rationale || "").slice(0, 400),
    };

    return res.json({ ok: true, proposed });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to propose DNA." });
  }
}
