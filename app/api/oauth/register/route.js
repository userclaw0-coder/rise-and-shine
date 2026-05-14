// Dynamic Client Registration (RFC 7591) for MCP Custom Connectors.
// Accepts redirect_uris + an optional client_name and returns a client_id.

import { registerClient } from "../../../../lib/mcp-oauth.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_request", error_description: "JSON body required" }, { status: 400 });
  }
  try {
    const client = await registerClient(body || {});
    return Response.json(client, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: "invalid_client_metadata", error_description: e.message },
      { status: 400 }
    );
  }
}
