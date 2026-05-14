// POST   /api/parts/:id/link  body: { task_id, role? }
// DELETE /api/parts/:id/link  body: { task_id }
// Manage task<->part links.

import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import {
  linkPartToTask,
  unlinkPartFromTask,
} from "../../../../lib/projectParts.js";

export default async function handler(req, res) {
  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { id: partId } = req.query;
  const taskId = req.body?.task_id;
  if (!partId || !taskId) {
    return res.status(400).json({ error: "part id + task_id required" });
  }

  try {
    if (req.method === "POST") {
      const role = req.body?.role || "installs";
      const link = await linkPartToTask(userId, taskId, partId, role);
      return res.status(201).json({ link });
    }

    if (req.method === "DELETE") {
      await unlinkPartFromTask(userId, taskId, partId);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/parts/:id/link] error:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}
