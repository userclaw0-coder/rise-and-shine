import { getAuthenticatedUserId } from "../../../../lib/api-auth";
import {
  getProjectPageData,
  saveSharedProjectWorkspace,
  serviceSupabase,
} from "../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const categoryId = String(req.query?.categoryId || "").trim();
    if (!categoryId) return res.status(400).json({ error: "categoryId is required" });

    if (req.method === "GET") {
      const [project, profileRow, importsRes] = await Promise.all([
        getProjectPageData(userId, categoryId),
        serviceSupabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
        serviceSupabase
          .from("external_ai_import_runs")
          .select("*")
          .eq("user_id", userId)
          .eq("category_id", categoryId)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      if (profileRow.error) throw profileRow.error;
      if (importsRes.error) throw importsRes.error;
      return res.json({
        ok: true,
        ...project,
        profile: profileRow.data?.profile || null,
        recent_imports: importsRes.data || [],
      });
    }

    if (req.method === "POST") {
      const saved = await saveSharedProjectWorkspace(userId, categoryId, req.body || {});
      return res.json({
        ok: true,
        workspace: saved.workspace,
        knowledge_base: saved.knowledge_base || "",
        legacy_links: saved.legacy_links || "",
        task_order_ids: Array.isArray(saved.task_order_ids) ? saved.task_order_ids : [],
        subtask_order_ids: saved.subtask_order_ids || {},
      });
    }

    return res.status(405).json({ error: "Unsupported method" });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to load project.",
    });
  }
}
