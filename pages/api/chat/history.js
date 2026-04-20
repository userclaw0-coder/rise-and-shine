// GET /api/chat/history
// Returns the user's recent chat messages for display

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const limit = Math.min(parseInt(req.query.limit) || 100, 200);

  // Jarvis owns NULL-scope rows only. Page-coach rows (scope = 'today',
  // 'project:<id>', etc.) stay out of the Jarvis transcript.
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls, tool_call_id, created_at")
    .eq("user_id", userId)
    .is("scope", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Reverse to chronological order
  const messages = (data || []).reverse();

  return res.json({ ok: true, messages });
}
