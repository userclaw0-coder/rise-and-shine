// GET /api/reorient/queue
// Returns the user's reorient queue: projects in priority order with
// staleness metadata, ready for the Phase A→B handoff.

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { getReorientQueue } from "../../../lib/reorientFlow";

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
    const queue = await getReorientQueue(userId);
    return res.status(200).json({ ok: true, queue });
  } catch (err) {
    console.error("[reorient/queue] failed:", err);
    return res.status(500).json({ error: err.message || "queue load failed" });
  }
}
