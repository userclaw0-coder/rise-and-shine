import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import { updateTaskStatusCollaborative } from "../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const userId = await getAuthenticatedUserId(req);
    const taskId = String(req.body?.task_id || "").trim();
    const status = String(req.body?.status || "").trim();
    if (!taskId || !status) return res.status(400).json({ error: "task_id and status are required" });
    const task = await updateTaskStatusCollaborative(userId, taskId, status);
    return res.json({ ok: true, task });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to update task status.",
    });
  }
}
