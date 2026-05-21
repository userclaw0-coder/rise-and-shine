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

// Claude's MCP bridge already namespaces tools as `mcp__<server-uuid>__<tool>`
// and the API caps the full prefixed name at 64 chars (regex
// ^[a-zA-Z0-9_-]{1,64}$). The historical default of "rise." also failed the
// regex (dots not allowed) and chewed 5 chars off the tool-name budget for
// no benefit. Default is now no server-side prefix; opt back in via env.
const TOOL_NAME_PREFIX = process.env.RISE_MCP_TOOL_PREFIX ?? "";

// Claude's MCP bridge wraps each tool name as `mcp__<server-uuid>__<tool>`
// before the Anthropic API sees it. The UUID is always 36 chars + `mcp__` (5)
// + `__` (2) = 43 chars of overhead. The API regex caps the full name at
// 64 chars, so the budget for our `${TOOL_NAME_PREFIX}${tool.name}` payload
// is 64 - 43 = 21 chars. Anything longer breaks tool registration silently
// (the whole tools array gets rejected and you lose all MCP tools at once).
const CLAUDE_BRIDGE_OVERHEAD = 43;
const MCP_NAME_BUDGET = 64 - CLAUDE_BRIDGE_OVERHEAD;

// Build the MCP-shaped tool list once at startup. Jarvis tools use
// `input_schema`; MCP wants `inputSchema`.
function buildMcpTools() {
  return getToolDefinitions().map((t) => ({
    name: `${TOOL_NAME_PREFIX}${t.name}`,
    description: t.description,
    inputSchema: t.input_schema || { type: "object", properties: {} },
  }));
}

function auditToolNames() {
  const tools = buildMcpTools();
  const oversized = tools.filter((t) => t.name.length > MCP_NAME_BUDGET);
  if (oversized.length) {
    console.error(
      `[rise-mcp] WARNING: ${oversized.length} tool name(s) exceed the ` +
        `${MCP_NAME_BUDGET}-char budget that Claude's MCP bridge leaves after ` +
        `prepending mcp__<server-uuid>__. These tools will silently fail to ` +
        `register and you'll lose ALL MCP tools, not just the long ones:`
    );
    for (const t of oversized) {
      console.error(
        `[rise-mcp]   ${t.name}  (${t.name.length} chars, over by ${t.name.length - MCP_NAME_BUDGET})`
      );
    }
    if (TOOL_NAME_PREFIX) {
      console.error(
        `[rise-mcp] HINT: server-side prefix is "${TOOL_NAME_PREFIX}" (${TOOL_NAME_PREFIX.length} chars). ` +
          `Unset RISE_MCP_TOOL_PREFIX to recover ${TOOL_NAME_PREFIX.length} chars of budget — ` +
          `Claude's mcp__<uuid>__ already namespaces, so the extra prefix is redundant.`
      );
    }
  }
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
  auditToolNames();
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
