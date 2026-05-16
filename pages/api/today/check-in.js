// POST /api/today/check-in
// Body: { date?, energy: "low"|"medium"|"high", focus_text?: string }
// Returns: { ok, morning_state }
//
// Captures the user's morning check-in state. Stored on daily_plans so
// the refill API can read it without an extra round-trip and bias the
// day's queue toward the right activation-energy band.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ENERGY = new Set(["low", "medium", "high"]);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const energy = String(req.body?.energy || "").toLowerCase();
  if (!ALLOWED_ENERGY.has(energy)) {
    return res
      .status(400)
      .json({ error: "energy must be one of low|medium|high" });
  }
  const focusText =
    typeof req.body?.focus_text === "string"
      ? req.body.focus_text.slice(0, 480)
      : null;
  const today = req.body?.date || new Date().toISOString().slice(0, 10);

  const morningState = {
    energy,
    focus_text: focusText || null,
    checked_in_at: new Date().toISOString(),
  };

  // Upsert preserves any existing queue / reflection on the row.
  const { error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: userId,
        date: today,
        morning_state: morningState,
      },
      { onConflict: "user_id,date" }
    );
  if (error) {
    return res.status(500).json({ error: error.message || "Save failed." });
  }

  return res.json({ ok: true, date: today, morning_state: morningState });
}
