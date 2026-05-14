// OAuth 2.1 authorization server metadata.
// Used by Claude's Custom Connector discovery flow.

import { authorizationServerMetadata } from "../../../lib/mcp-oauth.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: { "Cache-Control": "no-store" },
  });
}
