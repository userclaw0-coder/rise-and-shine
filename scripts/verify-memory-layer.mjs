#!/usr/bin/env node
// End-to-end verification of the warm-tier memory layer.
//
// Exercises:
//   1. lib/memories.writeMemory / searchMemories          (DB + embedding round-trip)
//   2. Scoped search filters to the right scope
//   3. Jarvis tool `write_memory` round-trips via executeTool
//   4. Jarvis tool `search_memories` returns the right shape
//   5. buildSystemPrompt includes <recent_memories> when relevant memories exist
//   6. Memory extractor dry-run against the real signal window
//
// Run:
//   node --env-file=.env.local scripts/verify-memory-layer.mjs

import { writeMemory, searchMemories, archive } from "../lib/memories.js";
import { executeTool } from "../lib/jarvis-tools.js";
import { buildSystemPrompt } from "../lib/jarvis-system-prompt.js";
import { extractMemoriesForUser } from "../lib/memory-extractor.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";

let passed = 0;
let failed = 0;
const cleanup = [];

function ok(label, detail) {
  passed += 1;
  console.log(`${PASS} ${label}${detail ? "  " + detail : ""}`);
}
function bad(label, err) {
  failed += 1;
  console.log(`${FAIL} ${label}`);
  if (err) console.log(`    ${err.message || err}`);
}

async function main() {
  console.log("\n=== Memory layer verification ===\n");

  // 1. Write a uniquely-worded test memory
  const sentinel = `Hawkswood-test-marker-${Date.now()}`;
  let createdId;
  try {
    const m = await writeMemory(USER_ID, {
      scope_type: "project",
      scope_id: "memory-test-fixture",
      kind: "fact",
      content: `The ${sentinel} indicates the U-BMS programming is the critical-path blocker.`,
      importance: 7,
      source: "seed",
    });
    createdId = m.id;
    cleanup.push(m.id);
    ok("writeMemory", `id=${m.id.slice(0, 8)}`);
  } catch (err) {
    bad("writeMemory", err);
  }

  // 2. Semantic search finds it
  try {
    const hits = await searchMemories(USER_ID, {
      query: "BMS programming blocker",
      top_k: 5,
    });
    const found = hits.find((h) => h.id === createdId);
    if (found && found.similarity > 0.4) {
      ok("searchMemories (global)", `found with similarity ${found.similarity.toFixed(3)}`);
    } else {
      bad(
        "searchMemories (global)",
        `expected sentinel near top; got ${hits.length} hits`
      );
    }
  } catch (err) {
    bad("searchMemories (global)", err);
  }

  // 3. Scoped search filters correctly
  try {
    const inScope = await searchMemories(USER_ID, {
      query: "BMS programming",
      scope_type: "project",
      scope_id: "memory-test-fixture",
      top_k: 5,
    });
    const outOfScope = await searchMemories(USER_ID, {
      query: "BMS programming",
      scope_type: "project",
      scope_id: "no-such-project-id",
      top_k: 5,
    });
    if (inScope.length >= 1 && outOfScope.length === 0) {
      ok("scoped search filters correctly");
    } else {
      bad(
        "scoped search",
        `in-scope=${inScope.length} out-of-scope=${outOfScope.length}`
      );
    }
  } catch (err) {
    bad("scoped search", err);
  }

  // 4. write_memory tool round-trips
  try {
    const toolSentinel = `tool-test-marker-${Date.now()}`;
    const res = await executeTool(
      "write_memory",
      {
        content: `The ${toolSentinel} confirms the write_memory tool works end-to-end.`,
        scope_type: "project",
        scope_id: "memory-test-fixture",
        kind: "fact",
        importance: 5,
      },
      USER_ID
    );
    if (res?.id) {
      cleanup.push(res.id);
      ok("Jarvis tool: write_memory", `id=${res.id.slice(0, 8)}`);
    } else {
      bad("Jarvis tool: write_memory", `unexpected result: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    bad("Jarvis tool: write_memory", err);
  }

  // 5. search_memories tool returns expected shape
  try {
    const res = await executeTool(
      "search_memories",
      { query: "memory test marker", top_k: 3 },
      USER_ID
    );
    if (
      res?.ok &&
      Array.isArray(res.memories) &&
      res.memories.every((m) => "similarity" in m)
    ) {
      ok("Jarvis tool: search_memories", `returned ${res.count} hits`);
    } else {
      bad("Jarvis tool: search_memories", `bad shape: ${JSON.stringify(res).slice(0, 100)}`);
    }
  } catch (err) {
    bad("Jarvis tool: search_memories", err);
  }

  // 6. System prompt includes <recent_memories> when relevant memories exist
  try {
    const prompt = await buildSystemPrompt(USER_ID, {
      query: "U-BMS programming on the boat",
    });
    if (
      prompt.includes("<recent_memories>") &&
      prompt.includes("<persona>") &&
      prompt.includes("<live_context>")
    ) {
      ok("buildSystemPrompt", "has <persona>, <live_context>, <recent_memories> anchors");
    } else {
      const has = {
        persona: prompt.includes("<persona>"),
        live: prompt.includes("<live_context>"),
        mem: prompt.includes("<recent_memories>"),
      };
      bad("buildSystemPrompt", `anchors: ${JSON.stringify(has)}`);
    }
  } catch (err) {
    bad("buildSystemPrompt", err);
  }

  // 7. Extractor dry-run: shouldn't crash; signalCount reflects reality
  try {
    const result = await extractMemoriesForUser(USER_ID, {
      dryRun: true,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (typeof result.signalCount === "number") {
      ok(
        "extractMemoriesForUser (dry-run, 7d window)",
        `signalCount=${result.signalCount} proposed=${result.proposed || 0} kept=${result.kept || 0} note="${(result.note || "").slice(0, 50)}"`
      );
    } else {
      bad("extractMemoriesForUser", `unexpected result: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    bad("extractMemoriesForUser", err);
  }

  // Cleanup
  console.log("\nCleaning up test memories...");
  for (const id of cleanup) {
    try {
      await archive(id);
    } catch {
      /* ignore */
    }
  }

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
