// POST /api/recurring/spawn-due
//   Trigger spawnDueRecurringTemplates for the authenticated user.
//   Idempotent — safe to call on every page load.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { spawnDueRecurringTemplates } from "../../../lib/recurringTasks.js";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  try {
    const result = await spawnDueRecurringTemplates(serviceClient, userId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[api/recurring/spawn-due] error:", err);
    return res.status(500).json({ error: err.message || "Spawn failed" });
  }
}
