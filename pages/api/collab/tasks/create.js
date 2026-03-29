import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import { createTaskCollaborative, replaceTaskAssignee, setTaskTagsCollaborative } from "../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const userId = await getAuthenticatedUserId(req);
    const payload = req.body || {};
    const task = await createTaskCollaborative(userId, payload);
    const taskId = task?.id;
    if (taskId && Array.isArray(payload.tags) && payload.tags.length > 0) {
      await setTaskTagsCollaborative(userId, taskId, payload.tags);
    }
    if (taskId && payload.assignee_user_id) {
      await replaceTaskAssignee(userId, taskId, payload.assignee_user_id);
    }
    return res.json({ ok: true, task });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to create task.",
    });
  }
}
