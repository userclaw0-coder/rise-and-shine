// GET /api/profile/visibility -> { is_public }
// POST /api/profile/visibility { is_public: boolean } -> { is_public }
// Uses service role to bypass RLS; authorizes via Supabase bearer token.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("user_profile")
      .select("is_public")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, is_public: !!data?.is_public });
  }

  if (req.method === "POST") {
    const nextValue = !!req.body?.is_public;
    const { data, error } = await supabase
      .from("user_profile")
      .upsert(
        { user_id: userId, is_public: nextValue },
        { onConflict: "user_id" }
      )
      .select("is_public")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, is_public: !!data?.is_public });
  }

  return res.status(405).json({ error: "GET or POST only" });
}
