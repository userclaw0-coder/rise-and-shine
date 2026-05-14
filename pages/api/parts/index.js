// GET  /api/parts?category_id=&status=&workstream=&location=&query=
//   List or search parts for the authenticated user.
//
// POST /api/parts
//   Body: { category_id, name, part_number?, manufacturer?, qty?, status?,
//           location?, workstream?, spec?, notes?, source_ref? }
//   Insert a new part.

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { addPart, listParts, searchParts } from "../../../lib/projectParts.js";

export default async function handler(req, res) {
  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  try {
    if (req.method === "GET") {
      const { category_id, status, workstream, location, query, limit } =
        req.query;
      const opts = {
        category_id: category_id || undefined,
        status: status || undefined,
        workstream: workstream || undefined,
        location: location || undefined,
        limit: limit ? Number(limit) : undefined,
      };
      const rows = query
        ? await searchParts(userId, { ...opts, query })
        : await listParts(userId, opts);
      return res.status(200).json({ parts: rows });
    }

    if (req.method === "POST") {
      const created = await addPart(userId, req.body || {});
      return res.status(201).json({ part: created });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/parts] error:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}
