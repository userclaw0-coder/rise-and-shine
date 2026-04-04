import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import { replaceTaskAssignee } from "../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const userId = await getAuthenticatedUserId(req);
    const taskId = String(req.body?.task_id || "").trim();
    const assigneeUserId = req.body?.assignee_user_id ? String(req.body.assignee_user_id).trim() : null;
    if (!taskId) return res.status(400).json({ error: "task_id is required" });
    const assignees = await replaceTaskAssignee(userId, taskId, assigneeUserId);
    return res.json({ ok: true, assignees });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to assign task.",
    });
  }
}
