#!/usr/bin/env node
// Quick verifier: lists the tools the MCP server would expose. Doesn't
// actually start the stdio transport — just prints the schema so you can
// confirm the wiring without configuring Claude Code first.
//
// Run:
//   npm run mcp:list-tools

import { getToolDefinitions } from "../lib/jarvis-tools.js";

const prefix = process.env.RISE_MCP_TOOL_PREFIX ?? "";
const tools = getToolDefinitions();

// Claude's MCP bridge prepends `mcp__<server-uuid>__` (43 chars). API caps
// the full name at 64 chars → emitted name must fit in 21 chars.
const BRIDGE_OVERHEAD = 43;
const NAME_BUDGET = 64 - BRIDGE_OVERHEAD;

console.log(`\nRise-and-Shine MCP would expose ${tools.length} tools (prefix: "${prefix}"):\n`);

const overflows = [];
for (const t of tools) {
  const emitted = `${prefix}${t.name}`;
  const over = emitted.length > NAME_BUDGET;
  if (over) overflows.push({ emitted, len: emitted.length });
  const marker = over ? `  ⚠ OVER BUDGET by ${emitted.length - NAME_BUDGET}` : "";
  console.log(`  ${emitted}${marker}`);
  const required = (t.input_schema?.required || []).join(", ") || "(none)";
  const props = Object.keys(t.input_schema?.properties || {}).join(", ") || "(none)";
  console.log(`      props=[${props}]  required=[${required}]`);
}

console.log(
  `\nUser pinned: ${(process.env.RISE_USER_ID || "<unset>").slice(0, 8)}…`
);
console.log(
  `Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MISSING"}`
);
console.log(
  `Budget: ${NAME_BUDGET} chars (64 API cap − ${BRIDGE_OVERHEAD} chars Claude bridge prefix).`
);
if (overflows.length) {
  console.log(
    `\n❌ ${overflows.length} tool name(s) over budget — Claude will reject the ` +
      `entire tools list and you'll lose all MCP tools. ` +
      (prefix
        ? `Unset RISE_MCP_TOOL_PREFIX (currently "${prefix}") to recover ${prefix.length} chars, or `
        : "") +
      `shorten the names below in lib/jarvis-tools.js.`
  );
  process.exit(1);
} else {
  console.log(`✓ All tool names fit within the ${NAME_BUDGET}-char budget.\n`);
}
