import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import { updateTaskCollaborative } from "../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const userId = await getAuthenticatedUserId(req);
    const taskId = String(req.body?.task_id || "").trim();
    if (!taskId) return res.status(400).json({ error: "task_id is required" });
    const task = await updateTaskCollaborative(userId, taskId, req.body?.patch || {});
    return res.json({ ok: true, task });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to update task.",
    });
  }
}
