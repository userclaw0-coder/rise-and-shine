// Conversation persistence and context windowing for Jarvis chat
// Stores messages in chat_messages table, manages context window

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Fetch the most recent messages for a user's conversation.
 * @param {string} userId
 * @param {number} limit - Max messages to fetch (default 50)
 * @returns {Promise<Array>} Messages in chronological order
 */
export async function getConversationWindow(userId, limit = 50) {
  // Jarvis rows have NULL scope. Page-coach rows ("today", "hits",
  // etc.) are excluded so Jarvis doesn't mix contexts.
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls, tool_call_id, created_at")
    .eq("user_id", userId)
    .is("scope", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  // Reverse to chronological order
  const messages = (data || []).reverse();
  return trimToTokenBudget(messages, 12000);
}

/**
 * Summarize recent page-coach conversations so Jarvis can reference
 * them without replaying the whole transcripts. One line per scope
 * with the most recent user question + assistant reply excerpt.
 */
export async function getPageCoachDigest(userId, limit = 5) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, scope, created_at")
    .eq("user_id", userId)
    .not("scope", "is", null)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) return [];
  const byScope = new Map();
  for (const row of data || []) {
    if (!row.scope) continue;
    if (!byScope.has(row.scope)) byScope.set(row.scope, []);
    if (byScope.get(row.scope).length < 6) byScope.get(row.scope).push(row);
  }

  // Decorate parameterized project scopes with the category name so
  // Jarvis's digest reads "project: BeachLife" instead of
  // "project:abcd-uuid".
  const projectIds = new Set();
  for (const scope of byScope.keys()) {
    if (scope.startsWith("project:")) {
      projectIds.add(scope.slice("project:".length));
    }
  }
  const projectNames = {};
  if (projectIds.size > 0) {
    const { data: cats } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", [...projectIds]);
    for (const c of cats || []) projectNames[c.id] = c.name;
  }

  const digests = [];
  for (const [scope, msgs] of byScope.entries()) {
    const chron = msgs.slice().reverse();
    const lastUser = [...chron].reverse().find((m) => m.role === "user");
    const lastAssistant = [...chron].reverse().find(
      (m) => m.role === "assistant"
    );
    let label = scope;
    if (scope.startsWith("project:")) {
      const id = scope.slice("project:".length);
      label = `project · ${projectNames[id] || id.slice(0, 8)}`;
    }
    digests.push({
      scope,
      label,
      last_at: chron[chron.length - 1]?.created_at,
      last_user_question: (lastUser?.content || "").slice(0, 200),
      last_coach_reply: (lastAssistant?.content || "").slice(0, 240),
      turns: msgs.length,
    });
  }
  return digests.sort((a, b) => (b.last_at || "").localeCompare(a.last_at || "")).slice(0, limit);
}

/**
 * Trim messages to fit within a rough token budget.
 * Keeps the most recent messages, always preserving the last user message.
 * Uses chars/4 as a rough token estimate.
 * @param {Array} messages
 * @param {number} budget - Approximate token budget
 * @returns {Array}
 */
export function trimToTokenBudget(messages, budget = 12000) {
  const charBudget = budget * 4;
  let totalChars = 0;

  // Walk backwards, accumulate until budget exceeded
  const kept = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgChars = estimateMessageChars(msg);
    if (totalChars + msgChars > charBudget && kept.length > 0) {
      break;
    }
    totalChars += msgChars;
    kept.unshift(msg);
  }

  return kept;
}

function estimateMessageChars(msg) {
  let chars = 0;
  if (msg.content) chars += msg.content.length;
  if (msg.tool_calls) chars += JSON.stringify(msg.tool_calls).length;
  return chars || 20; // minimum estimate for empty messages
}

/**
 * Convert stored messages to the format expected by ai-provider.
 * Strips tool_call/tool_result messages from history — the AI only needs
 * the user/assistant conversation flow for context. Tool calls are only
 * relevant within the current turn's agentic loop.
 * @param {Array} messages - Messages from getConversationWindow
 * @returns {Array} Messages formatted for chatCompletion
 */
export function formatForProvider(messages) {
  const formatted = [];
  for (const msg of messages) {
    // Skip tool_call and tool_result messages from history — they cause
    // orphaned tool_use_id errors when loaded across sessions
    if (msg.role === "tool_call" || msg.role === "tool_result") continue;

    if (msg.role === "assistant") {
      // Strip any tool_calls from historical assistant messages
      const content = (msg.content || "").trim();
      if (!content) continue; // skip empty assistant messages (tool-only turns or failed responses)
      formatted.push({ role: "assistant", content });
      continue;
    }

    // Skip user messages with empty content (shouldn't happen but guard against it)
    const userContent = (msg.content || "").trim();
    if (!userContent) continue;

    formatted.push({ role: msg.role, content: userContent });
  }

  // Ensure messages alternate user/assistant (Anthropic requires this).
  // Merge consecutive same-role messages.
  const merged = [];
  for (const msg of formatted) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = (last.content || "") + "\n\n" + (msg.content || "");
    } else {
      merged.push({ ...msg });
    }
  }

  // Anthropic requires the first message to be from the user
  while (merged.length > 0 && merged[0].role !== "user") {
    merged.shift();
  }

  return merged;
}

/**
 * Persist a message to the chat_messages table.
 * @param {string} userId
 * @param {object} message - {role, content?, tool_calls?, tool_call_id?}
 * @returns {Promise<{id: string}>}
 */
export async function persistMessage(userId, message) {
  const row = {
    user_id: userId,
    role: message.role,
    content: message.content || null,
    tool_calls: message.tool_calls || null,
    tool_call_id: message.tool_call_id || null,
    scope: null, // Jarvis owns NULL scope; page-coach rows use a label
  };

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

/**
 * Persist multiple messages at once (for tool call/result pairs).
 * @param {string} userId
 * @param {Array} messages
 * @returns {Promise<Array<{id: string}>>}
 */
export async function persistMessages(userId, messages) {
  const rows = messages.map((m) => ({
    user_id: userId,
    role: m.role,
    content: m.content || null,
    tool_calls: m.tool_calls || null,
    tool_call_id: m.tool_call_id || null,
    scope: null,
  }));

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(rows)
    .select("id");
  if (error) throw error;
  return data;
}
