// POST /api/coach/project-outcomes
// Body: { category_id }
// Returns: { ok, outcomes: [{ text, reason, confidence }] }
// Coach proposes 3 candidate 90-day outcomes for a project, anchored to
// the user's vision and the project's open work.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
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

  const categoryId = String(req.body?.category_id || "");
  if (!categoryId) return res.status(400).json({ error: "category_id required" });

  try {
    const [catRes, tasksRes, profileRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("id", categoryId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("title, status, priority, effort_hours, outcome_ids")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(40),
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    ]);

    if (catRes.error) throw catRes.error;
    if (!catRes.data) return res.status(404).json({ error: "Category not found" });

    const project = catRes.data;
    const tasks = tasksRes.data || [];
    const profile = profileRes.data?.profile || {};

    const visionOutcomes = (profile.desired_outcomes || [])
      .map((o) => o.title)
      .filter(Boolean)
      .slice(0, 8);
    const thrive = (profile.thrive_goals || []).slice(0, 6);
    const identity = profile.identity_attributes || [];

    const compact = {
      project: project.name,
      vision_outcomes: visionOutcomes,
      thrive_goals: thrive,
      identity: Array.isArray(identity) ? identity.slice(0, 6) : identity,
      open_tasks: tasks
        .filter((t) => t.status !== "done")
        .slice(0, 18)
        .map((t) => `${t.title} (${t.priority || "Medium"})`),
      done_tasks: tasks
        .filter((t) => t.status === "done")
        .slice(0, 8)
        .map((t) => t.title),
    };

    const system = `You are the Rise & Shine project coach. The user is reviewing a single project. Propose three 90-day OUTCOMES the project should aim for — bets that, if true in 90 days, mean this project succeeded. Anchor each to the user's vision/thrive goals where possible.

Return strict JSON: {"outcomes":[{"text":"...","reason":"...","confidence":"high"|"medium"|"low"}]}. No prose, no markdown.`;

    const userPrompt = `Project & user context (JSON):
${JSON.stringify(compact, null, 2)}

Propose three 90-day outcomes for "${project.name}". Each should be specific, measurable when reasonable, and explicitly tied to one of the user's vision items or thrive goals. Keep each "text" under 100 characters. Return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    const outcomes = Array.isArray(parsed?.outcomes) ? parsed.outcomes.slice(0, 3) : [];

    if (outcomes.length === 0) {
      return res.status(502).json({ error: "AI returned no outcomes." });
    }

    return res.json({ ok: true, outcomes });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to propose outcomes." });
  }
}
