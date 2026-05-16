// POST /api/today/reflection
// Body: { date?, entries: [{slot, landed, felt?, note?}] }
//   slot:   1|2|3
//   landed: boolean
//   felt:   "easy"|"hard"|"neutral" (optional)
//   note:   string ≤240 chars (optional)
// Returns: { ok, reflection }
//
// End-of-day reflection. Stored on daily_plans.reflection. Read later by
// lib/dailyReflection.js to derive activation-energy adjustments per
// vector — tasks/projects that repeatedly "felt hard" get an AE penalty
// in subsequent rankings; ones that felt easy get a small boost.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_FELT = new Set(["easy", "hard", "neutral"]);

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const slot = Number(raw.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 3) return null;
  const landed = !!raw.landed;
  const felt =
    typeof raw.felt === "string" && ALLOWED_FELT.has(raw.felt.toLowerCase())
      ? raw.felt.toLowerCase()
      : null;
  const note =
    typeof raw.note === "string" && raw.note.trim()
      ? raw.note.trim().slice(0, 240)
      : null;
  return { slot, landed, felt, note };
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

  const today = req.body?.date || new Date().toISOString().slice(0, 10);
  const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const entries = rawEntries.map(normalizeEntry).filter(Boolean);
  if (entries.length === 0) {
    return res.status(400).json({ error: "entries required (one per slot)" });
  }

  const reflection = {
    entries,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: userId,
        date: today,
        reflection,
      },
      { onConflict: "user_id,date" }
    );
  if (error) {
    return res.status(500).json({ error: error.message || "Save failed." });
  }

  return res.json({ ok: true, date: today, reflection });
}
