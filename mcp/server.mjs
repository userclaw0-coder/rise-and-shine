#!/usr/bin/env node
// Rise-and-Shine MCP server.
//
// Exposes the same toolset the in-app Jarvis agent uses, so external MCP
// clients (Claude Code, Claude Dispatch, Claude.ai) can drive Rise-and-Shine
// directly — create tasks, run a Reorient pass, write/search memories,
// triage in bulk, manage ISCs, etc.
//
// Transport: stdio (the canonical Claude Code MCP transport).
// Auth: single-tenant. RISE_USER_ID is pinned via env. The MCP server has
//       service-role Supabase access (same as the app's API routes); the
//       trust boundary is "you can run this binary on Tom's Mac."
//
// To add to Claude Code:
//   1. Run once: `npm install` (gets @modelcontextprotocol/sdk)
//   2. Edit ~/.claude.json (or ~/.config/claude-code/mcp.json) and add:
//        {
//          "mcpServers": {
//            "rise-and-shine": {
//              "command": "node",
//              "args": ["--env-file=.env.local",
//                       "/Users/tomsaunders/Documents/code/rise-and-shine/mcp/server.mjs"],
//              "cwd": "/Users/tomsaunders/Documents/code/rise-and-shine"
//            }
//          }
//        }
//   3. Restart Claude Code. The Rise-and-Shine tools appear in ToolSearch
//      under names like `rise.get_todays_queue`, `rise.create_task`, etc.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getToolDefinitions, executeTool } from "../lib/jarvis-tools.js";

const USER_ID = process.env.RISE_USER_ID;
if (!USER_ID) {
  console.error(
    "[rise-mcp] RISE_USER_ID is required. Set it in .env.local or pass via --env-file."
  );
  process.exit(2);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[rise-mcp] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
  );
  process.exit(2);
}

const TOOL_NAME_PREFIX = process.env.RISE_MCP_TOOL_PREFIX ?? "rise.";

// Build the MCP-shaped tool list once at startup. Jarvis tools use
// `input_schema`; MCP wants `inputSchema`. Names are prefixed so they
// don't collide with other MCP servers in the same client.
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
  // MCP expects content as an array of typed blocks. Stringify the
  // structured tool result so clients with JSON parsers can consume it.
  const text =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const isErr =
    result && typeof result === "object" && "error" in result && result.error;
  return {
    content: [{ type: "text", text }],
    isError: !!isErr,
  };
}

const server = new Server(
  {
    name: "rise-and-shine",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions:
      "Rise-and-Shine personal life-OS tools (tasks, projects, memories, ISCs, Reorient). " +
      "All tools operate as the user pinned by RISE_USER_ID (single-tenant). " +
      "\n\nBOOTSTRAP — call FIRST at session start: `get_session_context` returns the user's " +
      "profile basics, top high-importance global memories (family composition, key " +
      "constraints, durable preferences), recent jarvis-feed and [session]-prefixed " +
      "notes (prior-session continuity), and active projects with mantras. Do this " +
      "BEFORE asserting any facts about the user — it closes the failure mode where " +
      "session memory doesn't transfer between new agent sessions.\n\n" +
      "Read tools (get_*) are safe; write tools (create_*, update_*, complete_task, " +
      "bulk_triage_tasks, write_memory, etc.) mutate live data — prefer the user's " +
      "approval before applying. Use this MCP when you want to drive Rise-and-Shine " +
      "directly rather than the web app.",
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: buildMcpTools() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const localName = stripPrefix(name);
  try {
    const result = await executeTool(localName, args || {}, USER_ID);
    return formatToolResult(result);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: err.message || String(err) }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio servers are silent on success — anything we write to stdout would
  // break the JSON-RPC framing. Log a single readiness line to stderr.
  console.error(
    `[rise-mcp] ready · user=${USER_ID.slice(0, 8)}…  tools=${getToolDefinitions().length}`
  );
}

main().catch((err) => {
  console.error("[rise-mcp] fatal:", err);
  process.exit(1);
});
