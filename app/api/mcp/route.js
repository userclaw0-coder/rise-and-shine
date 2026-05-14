// MCP Streamable HTTP endpoint for remote Claude Custom Connectors.
//
// Auth: Bearer token in Authorization header. Token issued by /api/oauth/token.
// Tools: identical to the stdio mcp/server.mjs — same getToolDefinitions /
// executeTool from lib/jarvis-tools.js so Code + Desktop + Cowork + web all
// see one canonical surface.
//
// Stateless mode: each request is a fresh transport. The MCP protocol
// "initialize" returns tools/capabilities; subsequent tools/call requests
// re-run on the fly. This fits Vercel serverless naturally.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getToolDefinitions, executeTool } from "../../../lib/jarvis-tools.js";
import { verifyAccessToken } from "../../../lib/mcp-oauth.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: allow up to 60s for tool execution

const TOOL_NAME_PREFIX = process.env.RISE_MCP_TOOL_PREFIX ?? "rise.";

function buildMcpTools() {
  return getToolDefinitions().map((t) => ({
    name: `${TOOL_NAME_PREFIX}${t.name}`,
    description: t.description,
    inputSchema: t.input_schema || { type: "object", properties: {} },
  }));
}

function stripPrefix(name) {
  return TOOL_NAME_PREFIX && name.startsWith(TOOL_NAME_PREFIX)
    ? name.slice(TOOL_NAME_PREFIX.length)
    : name;
}

function formatToolResult(result) {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const isErr =
    result && typeof result === "object" && "error" in result && result.error;
  return {
    content: [{ type: "text", text }],
    isError: !!isErr,
  };
}

function unauthorized(reason = "invalid_token") {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: `Unauthorized: ${reason}` },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="rise-mcp", error="${reason}"`,
      },
    }
  );
}

async function authenticate(req) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: "missing_token" };
  }
  const token = authHeader.slice(7).trim();
  try {
    const { userId, scope } = await verifyAccessToken(token);
    return { userId, scope };
  } catch (e) {
    return { error: e.message || "invalid_token" };
  }
}

function buildServer(userId) {
  const server = new Server(
    { name: "rise-and-shine", version: "0.1.0" },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildMcpTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const namePrefixed = request.params?.name;
    const args = request.params?.arguments || {};
    if (!namePrefixed) {
      return formatToolResult({ error: "Tool name missing" });
    }
    const internalName = stripPrefix(namePrefixed);
    const result = await executeTool(internalName, args, userId);
    return formatToolResult(result);
  });

  return server;
}

async function handle(req) {
  const auth = await authenticate(req);
  if (auth.error) return unauthorized(auth.error);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });
  const server = buildServer(auth.userId);
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch (e) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal error: ${e.message || e}` },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req) {
  return handle(req);
}

export async function GET(req) {
  return handle(req);
}

export async function DELETE(req) {
  return handle(req);
}
