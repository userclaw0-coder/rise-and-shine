import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  listAccessibleCategoriesWithMeta,
  listBacklogTasksForActor,
  serviceSupabase,
} from "../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    const userId = await getAuthenticatedUserId(req);
    const [categories, tasks, profileRow] = await Promise.all([
      listAccessibleCategoriesWithMeta(userId),
      listBacklogTasksForActor(userId, { includeArchived: false }),
      serviceSupabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    ]);
    if (profileRow.error) throw profileRow.error;
    return res.json({
      ok: true,
      categories,
      tasks,
      profile: profileRow.data?.profile || null,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to load collaborative projects.",
    });
  }
}
