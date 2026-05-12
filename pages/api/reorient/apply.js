// POST /api/reorient/apply
// Body: { category_id, mantra?, narrative?, knowledge_base?, resources?,
//          mode?, decisions: [{task_id, action: 'done'|'archive'|'keep', phase?}] }

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { applyProjectReorient } from "../../../lib/reorientFlow";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const {
    category_id,
    mantra,
    narrative,
    knowledge_base,
    resources,
    mode,
    drive_folder_url,
    decisions,
  } = req.body || {};

  if (!category_id) {
    return res.status(400).json({ error: "category_id required" });
  }

  try {
    const result = await applyProjectReorient(userId, category_id, {
      mantra,
      narrative,
      knowledge_base,
      resources,
      mode,
      drive_folder_url,
      decisions: Array.isArray(decisions) ? decisions : [],
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[reorient/apply] failed:", err);
    return res.status(500).json({ error: err.message || "Apply failed" });
  }
}
