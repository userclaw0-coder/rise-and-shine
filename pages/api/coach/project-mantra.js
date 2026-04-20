// POST /api/coach/project-mantra
// Body: { category_id, current_mantra?: string }
// Returns: { ok, suggestion: string, reason: string }
// Coach proposes a single-line source-of-truth statement for a project —
// what this project is FOR, in the user's voice.

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const categoryId = String(req.body?.category_id || "");
  const currentMantra = String(req.body?.current_mantra || "").trim();
  if (!categoryId) return res.status(400).json({ error: "category_id required" });

  try {
    const [catRes, tasksRes, profileRes, workspaceRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("id", categoryId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("title, status, priority, outcome_ids")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .is("archived_at", null)
        .limit(40),
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
      supabase
        .from("shared_project_workspaces")
        .select("knowledge_base")
        .eq("category_id", categoryId)
        .maybeSingle(),
    ]);

    if (catRes.error) throw catRes.error;
    if (!catRes.data) return res.status(404).json({ error: "Project not found" });

    const project = catRes.data;
    const tasks = tasksRes.data || [];
    const profile = profileRes.data?.profile || {};
    const kb = (workspaceRes.data?.knowledge_base || "").slice(0, 2000);

    const linkedOutcomeIds = new Set();
    for (const t of tasks) {
      for (const id of t.outcome_ids || []) linkedOutcomeIds.add(id);
    }
    const linkedOutcomes = (profile.desired_outcomes || [])
      .filter((o) => linkedOutcomeIds.has(o.id))
      .map((o) => o.title)
      .filter(Boolean);

    const compact = {
      project: project.name,
      current_mantra: currentMantra || null,
      identity: (profile.identity_attributes || []).slice(0, 6),
      thrive_goals: (profile.thrive_goals || []).slice(0, 4),
      linked_outcomes: linkedOutcomes.slice(0, 6),
      open_task_titles: tasks
        .filter((t) => t.status !== "done")
        .slice(0, 12)
        .map((t) => t.title),
      knowledge_base_excerpt: kb,
    };

    const system = `You are the Rise & Shine project coach. Write a single-line "source of truth" statement for a project — ONE sentence (under 140 characters) that captures what this project is FOR, in the user's voice. Concrete, specific, plain prose. Not a tagline, not a goal — a compass statement the user reads at the top of the page to remember why the project exists.

${
  currentMantra
    ? "The user has an existing statement; propose a tightened or clarified rewrite. Keep the spirit, sharpen the language."
    : "The user hasn't written one yet; draft the first version from the project's context."
}

Return strict JSON: {"suggestion":"…","reason":"one short sentence explaining the edit"}. No prose outside JSON.`;

    const userPrompt = `Project context (JSON):
${JSON.stringify(compact, null, 2)}

Write the statement and a one-sentence reason for your wording. Return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    const suggestion = String(parsed?.suggestion || "").trim().slice(0, 280);
    const reason = String(parsed?.reason || "").trim().slice(0, 400);

    if (!suggestion) {
      return res.status(502).json({ error: "AI returned no suggestion." });
    }

    return res.json({ ok: true, suggestion, reason });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to suggest mantra." });
  }
}
