// POST /api/coach/score-idea
// Body: { idea_id }
// Returns: { ok, scores: { alignment, leverage, feasibility, novelty, timing, heat, critique: {strength, risk, question, next_step} } }
// Scores an idea against the user's vision and persists it into ideas.scores.

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

function clampInt(n, lo = 0, hi = 100) {
  const x = Math.round(Number(n));
  if (Number.isNaN(x)) return null;
  return Math.min(hi, Math.max(lo, x));
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

  const ideaId = String(req.body?.idea_id || "");
  if (!ideaId) return res.status(400).json({ error: "idea_id required" });

  try {
    const [ideaRes, profileRes] = await Promise.all([
      supabase
        .from("ideas")
        .select("id, title, details")
        .eq("id", ideaId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    ]);

    if (!ideaRes.data) return res.status(404).json({ error: "Idea not found" });
    const idea = ideaRes.data;
    const profile = profileRes.data?.profile || {};
    const visionOutcomes = (profile.desired_outcomes || [])
      .map((o) => o.title)
      .filter(Boolean)
      .slice(0, 8);
    const thrive = (profile.thrive_goals || []).slice(0, 6);
    const identity = profile.identity_attributes || [];

    const system = `You are the Rise & Shine ideas coach. Score an idea against the user's vision, then give a brief critique.

Return strict JSON:
{
  "alignment": 0-100,     // how well it serves the user's vision / thrive goals
  "leverage": 0-100,      // compounding potential if it works
  "feasibility": 0-100,   // how doable it is given the user's context
  "novelty": 0-100,       // how new/different it is for this user
  "timing": 0-100,        // how right-now it is given current life context
  "heat": 0-100,          // the user's own excitement signal (estimate if unknown)
  "critique": {
    "strength": "one sentence — what's right about this",
    "risk": "one sentence — the main failure mode",
    "question": "one sharp question to ask before committing",
    "next_step": "one concrete ≤30min action to validate the idea"
  }
}

No markdown, no prose outside JSON.`;

    const userPrompt = `Idea title: "${idea.title}"
Idea details: ${idea.details || "(none)"}

User vision outcomes: ${JSON.stringify(visionOutcomes)}
Thrive goals: ${JSON.stringify(thrive)}
Identity: ${JSON.stringify(Array.isArray(identity) ? identity.slice(0, 6) : identity)}

Score this idea and return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    if (!parsed) return res.status(502).json({ error: "AI returned invalid JSON." });

    const scores = {
      alignment: clampInt(parsed.alignment),
      leverage: clampInt(parsed.leverage),
      feasibility: clampInt(parsed.feasibility),
      novelty: clampInt(parsed.novelty),
      timing: clampInt(parsed.timing),
      heat: clampInt(parsed.heat),
      critique: {
        strength: String(parsed.critique?.strength || "").slice(0, 400),
        risk: String(parsed.critique?.risk || "").slice(0, 400),
        question: String(parsed.critique?.question || "").slice(0, 400),
        next_step: String(parsed.critique?.next_step || "").slice(0, 400),
      },
      scored_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from("ideas")
      .update({ scores })
      .eq("id", ideaId)
      .eq("user_id", userId);
    if (updateErr) {
      // Likely migration not run yet — surface cleanly
      return res.status(500).json({
        error:
          updateErr.message +
          " — did you run db/IDEAS_SCORES_SCHEMA.sql in Supabase?",
      });
    }

    return res.json({ ok: true, scores });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to score idea." });
  }
}
