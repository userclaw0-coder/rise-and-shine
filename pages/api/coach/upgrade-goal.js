// POST /api/coach/upgrade-goal
// Body: { goal: "original text", frameworks?: ["smart","woop","identity","pre-mortem"] }
// Returns: { ok, original, upgrades: [{framework, rewrite, notes}] }
// Runs a fuzzy goal through proven frameworks.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FRAMEWORK_NOTES = {
  smart:
    "SMART: Specific, Measurable, Achievable, Relevant, Time-bound. Rewrite the goal so it passes all five.",
  woop:
    "WOOP (Oettingen): name the Wish, the best Outcome if achieved, the main Obstacle in the user's life, and the Plan to handle that obstacle. Blend into one rewrite + a short plan.",
  identity:
    "Identity (Clear): rewrite as an identity-based goal — 'I am the kind of person who ___' — with one daily practice that reinforces that identity.",
  "pre-mortem":
    "Pre-mortem (Klein/Kahneman): imagine it's 12 months out and the goal failed. Name the 2-3 most likely failure modes, then rewrite the goal with guardrails against them.",
};

const DEFAULT_FRAMEWORKS = ["smart", "woop", "identity", "pre-mortem"];

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

  const goal = String(req.body?.goal || "").trim();
  if (!goal) return res.status(400).json({ error: "goal required" });
  const frameworks = Array.isArray(req.body?.frameworks)
    ? req.body.frameworks.filter((f) => FRAMEWORK_NOTES[f])
    : DEFAULT_FRAMEWORKS;
  if (frameworks.length === 0)
    return res.status(400).json({ error: "no valid frameworks" });

  try {
    const { data: profileRow } = await supabase
      .from("user_profile")
      .select("profile")
      .eq("user_id", userId)
      .maybeSingle();
    const profile = profileRow?.profile || {};
    const identity = profile.identity_attributes || [];

    const frameworkInstructions = frameworks
      .map((f) => `- ${f}: ${FRAMEWORK_NOTES[f]}`)
      .join("\n");

    const system = `You are the Rise & Shine goal-upgrade coach. The user has a vague goal. Rewrite it through each requested framework so each version is concrete, specific, and measurable when reasonable.

Return strict JSON: {"upgrades":[{"framework":"smart","rewrite":"...","notes":"1-2 sentences explaining what you changed and why."}]}. No prose, no markdown outside JSON.`;

    const userPrompt = `Original goal:
"${goal}"

User identity anchors: ${JSON.stringify(identity)}

Apply these frameworks:
${frameworkInstructions}

For each framework, produce a fresh rewrite (not a tweak of the previous). Return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    const upgrades = Array.isArray(parsed?.upgrades)
      ? parsed.upgrades
          .filter((u) => u?.framework && u?.rewrite)
          .map((u) => ({
            framework: String(u.framework).toLowerCase(),
            rewrite: String(u.rewrite).slice(0, 600),
            notes: String(u.notes || "").slice(0, 400),
          }))
      : [];

    if (upgrades.length === 0) {
      return res.status(502).json({ error: "AI returned no upgrades." });
    }

    return res.json({ ok: true, original: goal, upgrades });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to upgrade goal." });
  }
}
