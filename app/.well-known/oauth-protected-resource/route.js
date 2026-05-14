// OAuth 2.0 protected resource metadata (RFC 9728).
// Tells clients which authorization server protects this resource.

import { protectedResourceMetadata } from "../../../lib/mcp-oauth.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: { "Cache-Control": "no-store" },
  });
}
