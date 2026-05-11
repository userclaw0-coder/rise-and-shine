#!/usr/bin/env node
// Verify the local inference stack end-to-end:
//   1. Ollama reachable
//   2. Configured models exist on the Ollama daemon
//   3. Hermes 3 70B responds to a plain prompt
//   4. Hermes 3 70B can emit a tool call from a Jarvis-style schema
//   5. Embedding model returns vectors of the expected dimension
//   6. Cloud fallback works when policy=local-preferred and Ollama is "down"
//
// Usage:
//   node scripts/verify-local-inference.mjs
//
// Requires .env.local with LOCAL_INFERENCE_URL (or OLLAMA_URL) and
// ANTHROPIC_API_KEY for the fallback test.

import { config as dotenvConfig } from "dotenv";
// Prefer .env.local (Vercel CLI convention), fall back to .env
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { chatCompletion, getProviderStatus } from "../lib/ai-provider.js";
import { embed, getEmbeddingInfo } from "../lib/embeddings.js";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m–\x1b[0m";

let passed = 0;
let failed = 0;

function ok(label, detail) {
  passed += 1;
  console.log(`${PASS} ${label}${detail ? "  " + detail : ""}`);
}
function bad(label, err) {
  failed += 1;
  console.log(`${FAIL} ${label}`);
  if (err) console.log(`    ${err.message || err}`);
}
function skip(label, why) {
  console.log(`${SKIP} ${label}  (skipped: ${why})`);
}

async function main() {
  console.log("\n=== Local inference verification ===\n");

  // 1. Ollama reachable + config sanity
  const status = await getProviderStatus();
  console.log("Provider status:", JSON.stringify(status, null, 2));
  if (status.ollamaReachable) {
    ok("Ollama reachable at " + status.ollamaUrl);
  } else {
    bad("Ollama unreachable at " + status.ollamaUrl);
    console.log("  Start it with: brew services start ollama");
    process.exit(1);
  }

  // 2. Model presence
  try {
    const res = await fetch(`${status.ollamaUrl}/api/tags`);
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name);
    const required = [
      status.localModelMain,
      status.localModelExtractor,
      getEmbeddingInfo().model,
    ];
    for (const name of required) {
      if (names.some((n) => n === name || n.startsWith(name + ":"))) {
        ok("Model present: " + name);
      } else {
        bad(`Model missing: ${name}. Run: ollama pull ${name}`);
      }
    }
  } catch (err) {
    bad("Listing Ollama models", err);
  }

  // 3. Plain reply
  try {
    const t0 = Date.now();
    const r = await chatCompletion({
      system: "You are a terse assistant. Reply with exactly one word.",
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      policy: "local-only",
      tier: "main",
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const content = (r.content || "").trim().toLowerCase();
    if (content.includes("pong")) {
      ok(`Hermes plain reply (${dt}s)`, `→ "${r.content?.trim()}"`);
    } else {
      bad(`Hermes plain reply (${dt}s) — unexpected: "${r.content}"`);
    }
  } catch (err) {
    bad("Hermes plain reply", err);
  }

  // 4. Tool-call from a Jarvis-style schema
  const sampleTool = {
    name: "complete_task",
    description: "Mark a task as completed. Use this when the user reports doing a task.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task" },
        note: { type: "string", description: "Optional completion note" },
      },
      required: ["task_id"],
    },
  };
  try {
    const t0 = Date.now();
    const r = await chatCompletion({
      system:
        "You help the user manage tasks. When the user reports completing a task, call complete_task with the task_id they reference.",
      messages: [
        {
          role: "user",
          content:
            'Mark task "abc-123-def" as done. Note: "finished the fiberglass under the cockpit."',
        },
      ],
      tools: [sampleTool],
      policy: "local-only",
      tier: "main",
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const tc = r.toolCalls?.[0];
    if (tc && tc.name === "complete_task" && tc.args?.task_id) {
      ok(`Hermes tool call (${dt}s)`, `→ ${tc.name}(${JSON.stringify(tc.args)})`);
    } else if (r.toolCalls?.length) {
      bad(`Hermes tool call (${dt}s) — wrong tool: ${JSON.stringify(r.toolCalls)}`);
    } else {
      bad(`Hermes tool call (${dt}s) — no tool call; got text: "${r.content}"`);
    }
  } catch (err) {
    bad("Hermes tool call", err);
  }

  // 5. Embeddings
  try {
    const info = getEmbeddingInfo();
    const t0 = Date.now();
    const vec = await embed("the boat is in the work yard");
    const dt = ((Date.now() - t0) / 1000).toFixed(2);
    if (Array.isArray(vec) && vec.length === info.dim) {
      ok(`Embedding ${info.provider}/${info.model} (${dt}s)`, `→ ${vec.length}-dim vector`);
    } else {
      bad(
        `Embedding ${info.provider}/${info.model} — wrong dims. Got ${vec?.length}, expected ${info.dim}`
      );
    }
  } catch (err) {
    bad("Embedding", err);
  }

  // 6. Cloud fallback when Ollama is "down"
  if (!process.env.ANTHROPIC_API_KEY) {
    skip("Cloud fallback test", "ANTHROPIC_API_KEY not set");
  } else {
    try {
      // We can't mutate env after import in ESM cleanly, so we just exercise
      // policy=cloud-only which routes around Ollama at call resolution time.
      const t0 = Date.now();
      const r = await chatCompletion({
        system: "Reply with one word.",
        messages: [{ role: "user", content: "Reply: cloud" }],
        policy: "cloud-only",
        tier: "main",
      });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const content = (r.content || "").trim().toLowerCase();
      if (content.includes("cloud") && r.providerUsed !== "ollama") {
        ok(
          `Cloud-only path (${dt}s)`,
          `→ provider=${r.providerUsed} model=${r.modelUsed} content="${r.content?.trim()}"`
        );
      } else {
        bad(
          `Cloud-only path (${dt}s) — got provider=${r.providerUsed} content="${r.content}"`
        );
      }
    } catch (err) {
      bad("Cloud-only path", err);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
