import { getAuthenticatedUserId } from "../../../../../lib/api-auth";
import {
  addProjectMemberByEmail,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
} from "../../../../../lib/projectCollaboration";

export default async function handler(req, res) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const categoryId = String(req.query?.categoryId || "").trim();
    if (!categoryId) return res.status(400).json({ error: "categoryId is required" });

    if (req.method === "GET") {
      const members = await listProjectMembers(userId, categoryId);
      return res.json({ ok: true, members });
    }

    if (req.method === "POST") {
      const email = String(req.body?.email || "").trim();
      const role = String(req.body?.role || "viewer").trim();
      if (!email) return res.status(400).json({ error: "email is required" });
      const members = await addProjectMemberByEmail(userId, categoryId, email, role);
      return res.json({ ok: true, members });
    }

    if (req.method === "PATCH") {
      const memberUserId = String(req.body?.member_user_id || "").trim();
      const role = String(req.body?.role || "viewer").trim();
      if (!memberUserId) return res.status(400).json({ error: "member_user_id is required" });
      const members = await updateProjectMemberRole(userId, categoryId, memberUserId, role);
      return res.json({ ok: true, members });
    }

    if (req.method === "DELETE") {
      const memberUserId = String(req.body?.member_user_id || "").trim();
      if (!memberUserId) return res.status(400).json({ error: "member_user_id is required" });
      const members = await removeProjectMember(userId, categoryId, memberUserId);
      return res.json({ ok: true, members });
    }

    return res.status(405).json({ error: "Unsupported method" });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to manage project members.",
    });
  }
}
