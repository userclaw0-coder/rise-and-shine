// GET /api/chat/nudges
// Returns nudge-worthy conditions for the FAB badge and auto-greeting

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { detectNudges } from "../../../lib/jarvis-nudges";

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

  try {
    const result = await detectNudges(userId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
