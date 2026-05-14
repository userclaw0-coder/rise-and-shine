// GET    /api/parts/:id     — read one part + linked tasks
// PATCH  /api/parts/:id     — update allowed fields
// DELETE /api/parts/:id     — delete

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  getPart,
  updatePart,
  deletePart,
  listTasksForPart,
} from "../../../lib/projectParts.js";

export default async function handler(req, res) {
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
    if (req.method === "GET") {
      const part = await getPart(userId, id);
      if (!part) return res.status(404).json({ error: "Not found" });
      const linked_tasks = await listTasksForPart(userId, id);
      return res.status(200).json({ part, linked_tasks });
    }

    if (req.method === "PATCH") {
      const updated = await updatePart(userId, id, req.body || {});
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ part: updated });
    }

    if (req.method === "DELETE") {
      await deletePart(userId, id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/parts/:id] error:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}
