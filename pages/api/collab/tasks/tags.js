import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import { setTaskTagsCollaborative } from "../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const userId = await getAuthenticatedUserId(req);
    const taskId = String(req.body?.task_id || "").trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    if (!taskId) return res.status(400).json({ error: "task_id is required" });
    await setTaskTagsCollaborative(userId, taskId, tags);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to update task tags.",
    });
  }
}
