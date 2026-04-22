// POST /api/tasks/auto-refill
// Body: { task_id }
// Fires the project-next-action auto-refill after a client-side completion.
// Idempotent — safe to call redundantly.

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { autoRefillAfterCompletion } from "../../../lib/projectNextAction";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const taskId = req.body?.task_id;
  if (!taskId) return res.status(400).json({ error: "task_id required" });

  const result = await autoRefillAfterCompletion(userId, taskId);
  return res.status(200).json(result);
}
