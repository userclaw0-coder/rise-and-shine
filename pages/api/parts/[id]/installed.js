// POST /api/parts/:id/installed   — convenience flip to status=installed

import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import { markInstalled } from "../../../../lib/projectParts.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id required" });
  }

  try {
    const at = req.body?.installed_at || null;
    const updated = await markInstalled(userId, id, at);
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.status(200).json({ part: updated });
  } catch (err) {
    console.error("[api/parts/:id/installed] error:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}
