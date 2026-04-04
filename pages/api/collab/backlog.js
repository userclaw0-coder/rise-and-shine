import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  getVisibleTaskTagSuggestions,
  listAccessibleCategoriesWithMeta,
  listBacklogTasksForActor,
  serviceSupabase,
} from "../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    const userId = await getAuthenticatedUserId(req);
    const includeArchived = String(req.query?.include_archived || "") === "1";
    const tasks = await listBacklogTasksForActor(userId, { includeArchived });
    const [categories, profileRow, tags] = await Promise.all([
      listAccessibleCategoriesWithMeta(userId),
      serviceSupabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
      getVisibleTaskTagSuggestions(userId, tasks.map((task) => task.id)),
    ]);
    if (profileRow.error) throw profileRow.error;
    return res.json({
      ok: true,
      tasks,
      categories,
      tags,
      profile: profileRow.data?.profile || null,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to load collaborative backlog.",
    });
  }
}
