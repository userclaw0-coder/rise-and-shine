// GET /api/collab/workspace-orders
// Returns task_order_ids and subtask_order_ids for all user's projects (lightweight)

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { serviceSupabase } from "../../../lib/projectCollaboration";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  try {
    // Get all categories owned by user
    const { data: categories, error: catErr } = await serviceSupabase
      .from("categories")
      .select("id")
      .eq("user_id", userId);
    if (catErr) throw catErr;

    const catIds = (categories || []).map((c) => c.id);
    if (catIds.length === 0) {
      return res.json({ ok: true, orders: {} });
    }

    const { data: workspaces, error: wsErr } = await serviceSupabase
      .from("shared_project_workspaces")
      .select("category_id, task_order_ids, subtask_order_ids")
      .in("category_id", catIds);
    if (wsErr) throw wsErr;

    const orders = {};
    for (const ws of workspaces || []) {
      orders[ws.category_id] = {
        task_order_ids: Array.isArray(ws.task_order_ids) ? ws.task_order_ids : [],
        subtask_order_ids: ws.subtask_order_ids || {},
      };
    }

    return res.json({ ok: true, orders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
