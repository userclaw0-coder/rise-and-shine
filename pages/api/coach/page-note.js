// POST /api/coach/page-note
// Body: { scope: "today"|"backlog"|"daily-hits"|"health", payload: {...} }
// Returns: { ok, note: string, chips?: [{label, action}] }
// Scope-aware coach message for a page. The page passes a compact
// summary of its visible state (so we don't re-query on the server).

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SCOPE_PROMPTS = {
  today:
    "You are on the Today page. One single paragraph (2-3 sentences). Call out what's well-fed, what's starving, or which pick gives the most leverage given the top-3 commitment. End with a short concrete nudge. Plain prose, no markdown.",
  backlog:
    "You are on the Action Items page. One paragraph (2-3 sentences). Spot imbalance: too many P0s, projects with stalled tasks, urgent/important mismatches. End with a concrete nudge. Plain prose, no markdown.",
  "daily-hits":
    "You are on the Daily Hits page. One paragraph (2-3 sentences). Highlight at-risk streaks, skipped mornings, or easy wins still open for today. End with a concrete nudge. Plain prose, no markdown.",
  health:
    "You are on the Body & Training page. One paragraph (2-3 sentences). Read the weekly plan and recent sessions: call out readiness, missed sessions, plateaus, or the next recommended session. Respect Occam rules — 48h recovery, 5s/5s cadence, 1×7+ on top set. Plain prose, no markdown.",
};

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const scope = String(req.body?.scope || "");
  const payload = req.body?.payload || {};
  const question = String(req.body?.question || "").trim().slice(0, 1000);
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

  if (!SCOPE_PROMPTS[scope]) {
    return res.status(400).json({ error: "unknown scope" });
  }

  try {
    // Pull light user context: identity + top desired outcomes.
    const { data: profileRow } = await supabase
      .from("user_profile")
      .select("profile")
      .eq("user_id", userId)
      .maybeSingle();
    const profile = profileRow?.profile || {};
    const userContext = {
      identity: (profile.identity_attributes || []).slice(0, 6),
      desired_outcomes: (profile.desired_outcomes || [])
        .map((o) => o.title)
        .filter(Boolean)
        .slice(0, 5),
      thrive_goals: (profile.thrive_goals || []).slice(0, 4),
    };

    const system = question
      ? `You are the Rise & Shine coach. The user is on the ${scope} page and asked a direct question. Answer in 2-4 sentences, concrete and tied to the page state they're looking at. Reference actual titles/numbers when useful. No headings, no markdown.`
      : `You are the Rise & Shine page-scoped coach. ${SCOPE_PROMPTS[scope]}

The user is looking at the page RIGHT NOW — they don't want a lecture, they want one honest observation tied to what's visible. Be concrete, not generic. Reference actual titles/numbers from the payload when useful.`;

    const userPromptBase = `Page scope: ${scope}

User context (JSON):
${JSON.stringify(userContext, null, 2)}

Page state (JSON):
${JSON.stringify(payload, null, 2)}`;

    const messages = [];
    // Replay short recent history (user/assistant pairs) for continuity
    for (const h of history) {
      if (h?.role === "user" && typeof h.content === "string") {
        messages.push({ role: "user", content: h.content });
      } else if (h?.role === "assistant" && typeof h.content === "string") {
        messages.push({ role: "assistant", content: h.content });
      }
    }
    if (question) {
      messages.push({
        role: "user",
        content: `${userPromptBase}\n\nMy question: ${question}`,
      });
    } else {
      messages.push({
        role: "user",
        content: `${userPromptBase}\n\nWrite the coach note as described. Plain prose, 2-3 sentences. No headings, no markdown.`,
      });
    }

    const result = await chatCompletion({ system, messages });

    const note = (result?.content || "").trim();
    if (!note) {
      return res.status(502).json({ error: "AI returned no content." });
    }

    return res.json({ ok: true, note });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to generate coach note." });
  }
}
