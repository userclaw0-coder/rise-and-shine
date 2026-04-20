// POST /api/coach/project-dna
// Body: { category_id, current_outcome_ids?, current_primary_life_domain? }
// Returns: { ok, proposed: { outcome_ids, primary_life_domain, rationale } }
// Coach proposes the two project-level DNA tags that cascade to all
// tasks under the category.

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

  const categoryId = String(req.body?.category_id || "");
  if (!categoryId) return res.status(400).json({ error: "category_id required" });
  const currentOutcomeIds = Array.isArray(req.body?.current_outcome_ids)
    ? req.body.current_outcome_ids
    : [];
  const currentDomain = req.body?.current_primary_life_domain || null;

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
        .select("title, status, priority, primary_life_domain, outcome_ids")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .is("archived_at", null)
        .limit(40),
      supabase
        .from("user_profile")
        .select("profile")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("shared_project_workspaces")
        .select("workspace, knowledge_base")
        .eq("category_id", categoryId)
        .maybeSingle(),
    ]);

    if (!catRes.data) return res.status(404).json({ error: "Project not found" });
    const project = catRes.data;
    const tasks = tasksRes.data || [];
    const profile = profileRes.data?.profile || {};
    const workspace = workspaceRes.data?.workspace || {};
    const mantra = workspace?.mantra || "";

    const allOutcomes = (profile.desired_outcomes || []).map((o) => ({
      id: o.id,
      title: o.title,
    }));
    const lifeDomainLabels = HUMAN_NEED_STRATEGY_KEYS.map((k) => ({
      key: k,
      label: HUMAN_NEED_STRATEGY_LABELS[k],
    }));

    const compact = {
      project: project.name,
      mantra,
      current_outcome_ids: currentOutcomeIds,
      current_primary_life_domain: currentDomain,
      identity: (profile.identity_attributes || []).slice(0, 6),
      thrive_goals: (profile.thrive_goals || []).slice(0, 4),
      open_task_titles: tasks
        .filter((t) => t.status !== "done")
        .slice(0, 18)
        .map((t) => t.title),
    };

    const system = `You are the Rise & Shine project-DNA coach. A project has TWO DNA tags that cascade to every task under it:

1. outcome_ids: which 1-3 desired outcomes this whole project serves. Pick by outcome id.
2. primary_life_domain: exactly one of the six human-need keys (business/finances/health/relationships/lifestyle/growth). Which need does working on this project feed?

This is a PROPOSAL the user will accept or reject. Be specific — anchor choices in the project's name, mantra, and what the open tasks actually look like, not generic thinking.

Return strict JSON:
{"outcome_ids":[…],"primary_life_domain":"…","rationale":"one short sentence tying the picks to the project's reality"}
No prose outside JSON.`;

    const userPrompt = `Project & user context (JSON):
${JSON.stringify(compact, null, 2)}

User's desired outcomes (pick ids from this list):
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
      rationale: String(parsed.rationale || "").slice(0, 400),
    };

    return res.json({ ok: true, proposed });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to propose project DNA." });
  }
}
