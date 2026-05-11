// lib/memories.js — warm-tier memory store API.
//
// Public functions:
//   writeMemory(userId, mem)         — embed + insert one memory
//   bulkWriteMemories(userId, mems)  — batched insert (used by the extractor)
//   searchMemories(userId, opts)     — semantic search via match_memories RPC
//   listByScope(userId, scope_type, scope_id, opts)  — non-semantic fetch
//   markUsed(memoryId)               — bump use_count + last_used_at
//   archive(memoryId)                — soft-delete (preserves history)
//   supersede(oldId, newId)          — merge: point old at new
//
// Internals use the service-role Supabase client by default (so server-side
// API routes and the extractor can run without a user JWT). For browser-side
// reads (which we don't currently do) a caller can pass a scoped client in
// the opts.client field.

import { createClient } from "@supabase/supabase-js";
import { embed } from "./embeddings.js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- helpers -----------------------------------------------------------

/** Convert a JS number[] into pgvector text input. */
function vectorLiteral(vec) {
  return "[" + vec.join(",") + "]";
}

/** Validate and normalize a memory record before insertion. */
function normalizeMemory(mem) {
  const SCOPE_TYPES = ["global", "outcome", "project", "task", "person"];
  const KINDS = [
    "fact",
    "decision",
    "preference",
    "relationship",
    "constraint",
    "observation",
    "commitment",
  ];
  const SOURCES = [
    "chat",
    "reflection",
    "user",
    "document",
    "task_event",
    "reorient",
    "seed",
  ];

  if (!mem || typeof mem !== "object") {
    throw new Error("memory must be an object");
  }
  if (!SCOPE_TYPES.includes(mem.scope_type)) {
    throw new Error(`invalid scope_type: ${mem.scope_type}`);
  }
  if (!KINDS.includes(mem.kind)) {
    throw new Error(`invalid kind: ${mem.kind}`);
  }
  if (!SOURCES.includes(mem.source)) {
    throw new Error(`invalid source: ${mem.source}`);
  }
  if (!mem.content || typeof mem.content !== "string" || !mem.content.trim()) {
    throw new Error("memory.content is required");
  }
  const importance = Math.max(
    1,
    Math.min(10, Number.isFinite(mem.importance) ? mem.importance : 5)
  );
  const confidence = Math.max(
    0,
    Math.min(1, Number.isFinite(mem.confidence) ? mem.confidence : 0.8)
  );
  return {
    scope_type: mem.scope_type,
    scope_id: mem.scope_id ?? null,
    kind: mem.kind,
    content: mem.content.trim(),
    importance,
    confidence,
    source: mem.source,
    source_ref: mem.source_ref ?? null,
  };
}

// --- public API --------------------------------------------------------

/**
 * Write a single memory: embed content, insert row, return the inserted row.
 */
export async function writeMemory(userId, mem, { client = supabaseAdmin } = {}) {
  if (!userId) throw new Error("userId required");
  const normalized = normalizeMemory(mem);
  const vec = await embed(normalized.content);
  const { data, error } = await client
    .from("memories")
    .insert({
      user_id: userId,
      ...normalized,
      embedding: vectorLiteral(vec),
    })
    .select(
      "id, scope_type, scope_id, kind, content, importance, confidence, source, source_ref, created_at"
    )
    .single();
  if (error) throw new Error(`writeMemory failed: ${error.message}`);
  return data;
}

/**
 * Write many memories in one round-trip. Embeds in parallel (be mindful of
 * Ollama saturation if the array is large — caller should chunk if >50).
 */
export async function bulkWriteMemories(userId, mems, { client = supabaseAdmin } = {}) {
  if (!userId) throw new Error("userId required");
  if (!Array.isArray(mems) || mems.length === 0) return [];
  const normalized = mems.map(normalizeMemory);
  const vectors = await Promise.all(normalized.map((m) => embed(m.content)));
  const rows = normalized.map((m, i) => ({
    user_id: userId,
    ...m,
    embedding: vectorLiteral(vectors[i]),
  }));
  const { data, error } = await client
    .from("memories")
    .insert(rows)
    .select(
      "id, scope_type, scope_id, kind, content, importance, confidence, source, source_ref, created_at"
    );
  if (error) throw new Error(`bulkWriteMemories failed: ${error.message}`);
  return data || [];
}

/**
 * Semantic search.
 * @param userId
 * @param opts.query           text to embed and search by
 * @param opts.scope_type      optional filter
 * @param opts.scope_id        optional filter (requires scope_type)
 * @param opts.kinds           optional array of kinds to include
 * @param opts.min_importance  default 1
 * @param opts.top_k           default 10
 * @param opts.markUsed        if true, increments use_count on returned memories
 * @returns Array<memory>      includes `similarity` field (0..1, higher = closer)
 */
export async function searchMemories(
  userId,
  {
    query,
    scope_type = null,
    scope_id = null,
    kinds = null,
    min_importance = 1,
    top_k = 10,
    markUsed = false,
    client = supabaseAdmin,
  } = {}
) {
  if (!userId) throw new Error("userId required");
  if (!query || !query.trim()) return [];
  const vec = await embed(query);
  const { data, error } = await client.rpc("match_memories", {
    p_user_id: userId,
    p_query_embedding: vectorLiteral(vec),
    p_scope_type: scope_type,
    p_scope_id: scope_id,
    p_kinds: kinds && kinds.length ? kinds : null,
    p_min_importance: min_importance,
    p_match_count: top_k,
  });
  if (error) throw new Error(`searchMemories failed: ${error.message}`);
  const rows = data || [];
  if (markUsed && rows.length > 0) {
    // Fire-and-forget; ranking concerns shouldn't gate the response.
    Promise.all(
      rows.map((r) => client.rpc("mark_memory_used", { p_memory_id: r.id }))
    ).catch(() => {
      /* silent */
    });
  }
  return rows;
}

/**
 * Non-semantic fetch of memories in a scope (e.g. "all memories about this project").
 */
export async function listByScope(
  userId,
  scope_type,
  scope_id,
  { kinds = null, limit = 50, client = supabaseAdmin } = {}
) {
  if (!userId) throw new Error("userId required");
  if (!scope_type) throw new Error("scope_type required");
  let q = client
    .from("memories")
    .select(
      "id, scope_type, scope_id, kind, content, importance, confidence, source, source_ref, created_at, last_used_at, use_count"
    )
    .eq("user_id", userId)
    .eq("scope_type", scope_type)
    .is("archived_at", null)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (scope_id !== undefined && scope_id !== null) {
    q = q.eq("scope_id", scope_id);
  }
  if (kinds && kinds.length) {
    q = q.in("kind", kinds);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listByScope failed: ${error.message}`);
  return data || [];
}

export async function markUsed(memoryId, { client = supabaseAdmin } = {}) {
  if (!memoryId) return;
  await client.rpc("mark_memory_used", { p_memory_id: memoryId });
}

export async function archive(memoryId, { client = supabaseAdmin } = {}) {
  if (!memoryId) throw new Error("memoryId required");
  const { error } = await client
    .from("memories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", memoryId);
  if (error) throw new Error(`archive failed: ${error.message}`);
}

export async function supersede(oldId, newId, { client = supabaseAdmin } = {}) {
  if (!oldId || !newId) throw new Error("oldId and newId required");
  const { error } = await client
    .from("memories")
    .update({ superseded_by: newId, archived_at: new Date().toISOString() })
    .eq("id", oldId);
  if (error) throw new Error(`supersede failed: ${error.message}`);
}
