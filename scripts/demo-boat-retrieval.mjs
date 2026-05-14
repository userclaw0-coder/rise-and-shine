// Demo: simulate Jarvis retrieving Boat context after the Drive seed.
// Runs the same retrieval path the system prompt uses per turn.

import { buildSystemPrompt } from "../lib/jarvis-system-prompt.js";
import { searchMemories } from "../lib/memories.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT_CATEGORY_ID = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";

console.log("\n=== 1. Scoped retrieval: 'cutlass bearing replacement' on Boat ===\n");
const r1 = await searchMemories(USER_ID, {
  query: "cutlass bearing replacement",
  scope_type: "project",
  scope_id: BOAT_CATEGORY_ID,
  top_k: 3,
});
for (const m of r1) {
  console.log(`  sim=${m.similarity.toFixed(3)} (${m.kind}) ${m.content.slice(0, 80)}…`);
}

console.log("\n=== 2. Global retrieval: 'who built the boat and when' ===\n");
const r2 = await searchMemories(USER_ID, {
  query: "who built the boat and when",
  top_k: 3,
});
for (const m of r2) {
  console.log(
    `  sim=${m.similarity.toFixed(3)} (${m.kind}, ${m.scope_type}) ${m.content.slice(0, 80)}…`
  );
}

console.log("\n=== 3. System prompt snippet for a hypothetical Jarvis turn ===\n");
const prompt = await buildSystemPrompt(USER_ID, {
  scope: `project:${BOAT_CATEGORY_ID}`,
  query: "What are the open safety items on the Boat I should know about?",
});
const memSection = prompt.match(/<recent_memories>[\s\S]*?<\/recent_memories>/);
if (memSection) {
  console.log(memSection[0].slice(0, 2000));
} else {
  console.log("(no <recent_memories> section in this prompt — payload was empty?)");
}
console.log("");
