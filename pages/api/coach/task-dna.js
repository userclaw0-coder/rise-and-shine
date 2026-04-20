// POST /api/coach/task-dna
// Body: { task_id }
// Returns: { ok, proposed: { outcome_ids, primary_life_domain, type_tag,
//                             effort_bucket, rationale } }
// Coach proposes the four Task DNA tags for a task. User accepts each
// field individually (trust, not autopilot).

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";
import {
  HUMAN_NEED_STRATEGY_KEYS,
  HUMAN_NEED_STRATEGY_LABELS,
} from "../../../lib/humanNeedStrategies";

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
    const [taskRes, profileRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, priority, effort_hours, category:categories(name), outcome_ids, primary_life_domain"
        )
        .eq("id", taskId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_profile")
        .select("profile")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (!taskRes.data) return res.status(404).json({ error: "Task not found" });
    const task = taskRes.data;
    const profile = profileRes.data?.profile || {};

    const allOutcomes = (profile.desired_outcomes || []).map((o) => ({
      id: o.id,
      title: o.title,
    }));
    const lifeDomainLabels = HUMAN_NEED_STRATEGY_KEYS.map((k) => ({
      key: k,
      label: HUMAN_NEED_STRATEGY_LABELS[k],
    }));

    const system = `You are the Rise & Shine task-tagging coach. Propose Task DNA — four tags — for a single task. This is a PROPOSAL the user will accept or reject field by field. Be specific, not generic.

1. outcome_ids: pick 1-2 of the user's desired outcomes this task most clearly serves. Use the outcome id. If none apply, return [].
2. primary_life_domain: pick exactly one of the six human-need keys (business/finances/health/relationships/lifestyle/growth). Pick the primary one — not secondary.
3. type_tag: exactly one of quick-win / high-leverage / progress / maintenance. Quick-win = ≤15 min, visible lift. High-leverage = compounds across projects. Progress = incremental steady move. Maintenance = keeps things running, not new ground.
4. effort_bucket: XS (≤15 min), S (15-30 min), M (30-90 min), L (>90 min — needs breakdown).

Return strict JSON:
{"outcome_ids":[…],"primary_life_domain":"…","type_tag":"…","effort_bucket":"…","rationale":"one short sentence explaining your picks"}
No prose outside JSON.`;

    const userPrompt = `Task: "${task.title}"
Project: ${task.category?.name || "—"}
Priority: ${task.priority || "Medium"}
Current effort: ${task.effort_hours ? `${Math.round(task.effort_hours * 60)} min` : "unknown"}
Current outcome_ids: ${JSON.stringify(task.outcome_ids || [])}
Current primary_life_domain: ${task.primary_life_domain || "—"}

User's desired outcomes (pick from these ids):
${JSON.stringify(allOutcomes, null, 2)}

Six human-need domains:
${JSON.stringify(lifeDomainLabels, null, 2)}

Propose DNA and return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    if (!parsed) return res.status(502).json({ error: "AI returned invalid JSON." });

    const allowedOutcomeIds = new Set(allOutcomes.map((o) => o.id));
    const proposed = {
      outcome_ids: Array.isArray(parsed.outcome_ids)
        ? parsed.outcome_ids.filter((id) => allowedOutcomeIds.has(id))
        : [],
      primary_life_domain: HUMAN_NEED_STRATEGY_KEYS.includes(
        parsed.primary_life_domain
      )
        ? parsed.primary_life_domain
        : null,
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
