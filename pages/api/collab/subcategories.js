import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { ensureSubcategoryCollaborative } from "../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const userId = await getAuthenticatedUserId(req);
    const categoryId = String(req.body?.category_id || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!categoryId) return res.status(400).json({ error: "category_id is required" });
    const subcategory = await ensureSubcategoryCollaborative(userId, categoryId, name);
    return res.json({ ok: true, subcategory });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to save subcategory.",
    });
  }
}
