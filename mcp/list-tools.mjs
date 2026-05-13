#!/usr/bin/env node
// Quick verifier: lists the tools the MCP server would expose. Doesn't
// actually start the stdio transport — just prints the schema so you can
// confirm the wiring without configuring Claude Code first.
//
// Run:
//   npm run mcp:list-tools

import { getToolDefinitions } from "../lib/jarvis-tools.js";

const prefix = process.env.RISE_MCP_TOOL_PREFIX ?? "rise.";
const tools = getToolDefinitions();

console.log(`\nRise-and-Shine MCP would expose ${tools.length} tools (prefix: "${prefix}"):\n`);
const grouped = {};
for (const t of tools) {
  // Bucket by first word of description for readability.
  const bucket = t.description?.split(/[.\s—:]/)[0]?.toLowerCase() || "other";
  if (!grouped[bucket]) grouped[bucket] = [];
  grouped[bucket].push(t);
}

for (const t of tools) {
  console.log(`  ${prefix}${t.name}`);
  const required = (t.input_schema?.required || []).join(", ") || "(none)";
  const props = Object.keys(t.input_schema?.properties || {}).join(", ") || "(none)";
  console.log(`      props=[${props}]  required=[${required}]`);
}

console.log(
  `\nUser pinned: ${(process.env.RISE_USER_ID || "<unset>").slice(0, 8)}…`
);
console.log(
  `Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MISSING"}\n`
);
