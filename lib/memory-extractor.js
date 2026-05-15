// lib/memory-extractor.js — propose new memories from recent chat + task events.
//
// Pulled by the daily cron at /api/memory/extract. Reads:
//   - chat_messages since last extraction
//   - task_events since last extraction (completed / created / archived / etc.)
//   - active projects and outcomes for grounding
//
// Sends them to the extractor model (tier=extractor, so Haiku by default).
// The model returns proposed memories as JSON; we filter/dedupe and write
// the survivors via bulkWriteMemories.
//
// Idempotency: each user has preferences.last_memory_extraction_at; we only
// pull events newer than that timestamp.

import { createClient } from "@supabase/supabase-js";
import { chatCompletion } from "./ai-provider.js";
import { bulkWriteMemories, searchMemories } from "./memories.js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extractor for a personal life-OS app called Rise & Shine.

Your job: read the user's recent activity (chat messages with the Jarvis agent, task events, project context) and propose atomic, durable facts to remember.

A good memory is:
- One self-contained sentence
- Stable across time (not "the user is frustrated today" — that's transient)
- Specific (names, IDs, numbers, decisions, relationships)
- Useful for future planning ("the BMS programming blocks all electric propulsion work")

Kinds:
- fact: stable factual information
- decision: a choice the user made with reasoning
- preference: how the user likes to work / be supported
- relationship: a named person/email/account/role tied to context
- constraint: something limiting choices
- observation: a pattern noticed across multiple events (use sparingly)
- commitment: a public promise or deadline the user took on

Scopes:
- global: applies across the user's whole system
- outcome: tied to a specific desired_outcome id (e.g., "vision-3")
- project: tied to a category_id
- task: tied to a task_id
- person: tied to a name or email

Skip:
- Restating tasks the user already wrote down (the task IS the memory)
- Emotional state observations from a single message
- Anything you'd be guessing about

Respond with one JSON object only, this exact shape:
{
  "memories": [
    {
      "scope_type": "global|outcome|project|task|person",
      "scope_id": "id-string-or-null",
      "kind": "fact|decision|preference|relationship|constraint|observation|commitment",
      "content": "one self-contained sentence",
      "importance": 1-10,
      "confidence": 0.0-1.0
    }
  ],
  "note": "optional one-line summary of what you saw or why no memories"
}

If nothing in the window warrants a new memory, return {"memories": [], "note": "..."}.
Be conservative — proposing 0-5 memories per window is normal; 10+ is rare.`;

// --- helpers -----------------------------------------------------------

async function getLastExtractionAt(userId) {
  const { data } = await supabaseAdmin
    .from("user_profile")
    .select("profile")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.profile?.preferences?.last_memory_extraction_at || null;
}

async function setLastExtractionAt(userId, iso) {
  const { data } = await supabaseAdmin
    .from("user_profile")
    .select("profile")
    .eq("user_id", userId)
    .maybeSingle();
  const profile = data?.profile || {};
  const next = {
    ...profile,
    preferences: {
      ...(profile.preferences || {}),
      last_memory_extraction_at: iso,
    },
  };
  await supabaseAdmin
    .from("user_profile")
    .upsert({ user_id: userId, profile: next }, { onConflict: "user_id" });
}

async function pullRecentSignal(userId, since) {
  const sinceIso = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [chatRes, eventRes, catRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from("chat_messages")
      .select("role, content, scope, created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(200),
    supabaseAdmin
      .from("task_events")
      .select("event_type, value, created_at, task_id, tasks(title, category_id, categories(name))")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(200),
    supabaseAdmin.from("categories").select("id, name").eq("user_id", userId),
    supabaseAdmin
      .from("user_profile")
      .select("profile")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const outcomes = (profileRes.data?.profile?.desired_outcomes || []).map((o) => ({
    id: o.id,
    title: o.title,
  }));
  const categories = catRes.data || [];

  return {
    sinceIso,
    chatMessages: chatRes.data || [],
    taskEvents: eventRes.data || [],
    categories,
    outcomes,
  };
}

function formatSignalForPrompt({ chatMessages, taskEvents, categories, outcomes, sinceIso }) {
  const parts = [];
  parts.push(`# Window\nSince: ${sinceIso}`);

  if (outcomes.length > 0) {
    parts.push(`\n# Active outcomes`);
    for (const o of outcomes.slice(0, 12)) parts.push(`- ${o.id}: ${o.title}`);
  }
  if (categories.length > 0) {
    parts.push(`\n# Active projects (category_id: name)`);
    for (const c of categories) parts.push(`- ${c.id}: ${c.name}`);
  }

  if (chatMessages.length > 0) {
    parts.push(`\n# Chat messages in window (${chatMessages.length})`);
    let charBudget = 8000;
    for (const m of chatMessages) {
      const line = `[${m.created_at?.slice(0, 16)} · ${m.scope || "global"} · ${m.role}] ${(m.content || "").slice(0, 400)}`;
      if (charBudget - line.length < 0) {
        parts.push(`… (${chatMessages.length - parts.length} more truncated)`);
        break;
      }
      parts.push(line);
      charBudget -= line.length;
    }
  }

  if (taskEvents.length > 0) {
    parts.push(`\n# Task events in window (${taskEvents.length})`);
    let charBudget = 4000;
    for (const e of taskEvents) {
      const title = e.tasks?.title || "?";
      const catName = e.tasks?.categories?.name || "?";
      const line = `[${e.created_at?.slice(0, 16)}] ${e.event_type} · ${title} (${catName})`;
      if (charBudget - line.length < 0) break;
      parts.push(line);
      charBudget -= line.length;
    }
  }

  return parts.join("\n");
}

function safeParseJSON(text) {
  if (!text) return null;
  // Strip code fences if model wrapped output.
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  // Find the outermost JSON object.
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function deduplicateAgainstExisting(userId, proposed) {
  // For each proposed memory, search for near-duplicates already stored.
  // Anything with similarity > 0.92 to an existing memory is dropped.
  const kept = [];
  for (const m of proposed) {
    if (!m.content || typeof m.content !== "string") continue;
    const hits = await searchMemories(userId, {
      query: m.content,
      scope_type: m.scope_type,
      scope_id: m.scope_id,
      top_k: 3,
    });
    const isDuplicate = hits.some((h) => h.similarity > 0.92);
    if (!isDuplicate) kept.push(m);
  }
  return kept;
}

// --- public API --------------------------------------------------------

/**
 * Extract proposed memories for a single user and write the survivors.
 *
 * @param userId
 * @param opts.since           ISO override; defaults to preferences.last_memory_extraction_at
 *                             or 24h ago.
 * @param opts.dryRun          if true, don't write — return proposals.
 * @param opts.maxToWrite      cap per run (default 20)
 * @returns { window, signalCount, proposed, written, dropped }
 */
export async function extractMemoriesForUser(
  userId,
  { since, dryRun = false, maxToWrite = 20 } = {}
) {
  if (!userId) throw new Error("userId required");

  const sinceFromProfile = since || (await getLastExtractionAt(userId));
  const signal = await pullRecentSignal(userId, sinceFromProfile);
  const signalCount = signal.chatMessages.length + signal.taskEvents.length;

  if (signalCount === 0) {
    if (!dryRun) await setLastExtractionAt(userId, new Date().toISOString());
    return {
      window: signal.sinceIso,
      signalCount,
      proposed: [],
      written: [],
      dropped: [],
      note: "no signal in window",
    };
  }

  const userPrompt = formatSignalForPrompt(signal);

  const response = await chatCompletion({
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tier: "extractor",
  });

  const parsed = safeParseJSON(response.content);
  const proposed = Array.isArray(parsed?.memories) ? parsed.memories : [];
  const note = parsed?.note || null;

  if (proposed.length === 0) {
    if (!dryRun) await setLastExtractionAt(userId, new Date().toISOString());
    return {
      window: signal.sinceIso,
      signalCount,
      proposed: [],
      written: [],
      dropped: [],
      note: note || "model returned no memories",
      providerUsed: response.providerUsed,
      modelUsed: response.modelUsed,
    };
  }

  // Coerce each proposal into a writable shape; the library will validate further.
  const ready = proposed
    .filter((p) => p && p.content && p.scope_type && p.kind)
    .slice(0, maxToWrite)
    .map((p) => ({
      scope_type: p.scope_type,
      scope_id: p.scope_id || null,
      kind: p.kind,
      content: p.content,
      importance: Math.max(1, Math.min(10, Math.round(Number(p.importance) || 5))),
      confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0.7)),
      source: "reflection",
    }));

  const kept = await deduplicateAgainstExisting(userId, ready);
  const dropped = ready.length - kept.length;

  let written = [];
  if (!dryRun && kept.length > 0) {
    written = await bulkWriteMemories(userId, kept);
  }
  if (!dryRun) await setLastExtractionAt(userId, new Date().toISOString());

  return {
    window: signal.sinceIso,
    signalCount,
    proposed: proposed.length,
    candidates: ready.length,
    kept: kept.length,
    written: dryRun ? kept : written,
    dropped,
    note,
    providerUsed: response.providerUsed,
    modelUsed: response.modelUsed,
  };
}
