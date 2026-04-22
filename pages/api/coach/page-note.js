// POST /api/coach/page-note
// Body: { scope: "today"|"backlog"|"daily-hits"|"health", payload: {...} }
// Returns: { ok, note: string, chips?: [{label, action}] }
// Scope-aware coach message for a page. The page passes a compact
// summary of its visible state (so we don't re-query on the server).

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";
import { getToolDefinitions, executeTool } from "../../../lib/jarvis-tools";

const MAX_TOOL_ROUNDS = 5;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Scope prompts — keys match PSShell.scope values. Aliases map legacy
// names back to the canonical design scope.
const SCOPE_ALIASES = {
  backlog: "actions",
  "daily-hits": "hits",
  health: "fitness",
  projects: "projects",
  project: "project",
};

const SCOPE_PROMPTS = {
  map:
    "You are on the System Map page — the overview of how the whole Rise & Shine system connects. One paragraph (2-3 sentences). Explain which loop (daily / project / strategic) the user should care about RIGHT NOW given their state, or point them to the page that's most worth opening next. End with a concrete nudge. Plain prose, no markdown.",
  vision:
    "You are on the Vision & Goals page. One paragraph (2-3 sentences). Spot alignment gaps — manifestations stuck at low %, outcomes with no contributing project, identity not edited in weeks, quarter focus missing. End with a concrete nudge. Plain prose, no markdown.",
  today:
    "You are on the Today page. One paragraph (2-3 sentences). The payload may include `context_notes` (the user's freeform dump of what's happening in their life today), `capacity` (light|normal|heavy|overwhelmed), and `life_situations` (pinned ongoing situations like 'dad's recovery'). Treat those as reality — acknowledge what they're carrying, scale your ambition to capacity (Heavy/Overwhelmed → propose ONE thing, not three; suggest clearing instead of piling on), and when the context implies a concrete next action, propose it as a chip with `action: create_task` and the ctx tag set to today's date so it can be traced back. Plain prose for the paragraph, no markdown.",
  hits:
    "You are on the Daily Hits page. One paragraph (2-3 sentences). Highlight at-risk streaks, skipped mornings, easy wins still open for today, or Saturday-pattern weakness. End with a concrete nudge. Plain prose, no markdown.",
  projects:
    "You are on the Projects list page — the user is looking at their whole portfolio of projects. One paragraph (2-3 sentences). Call out the project that hasn't moved in longest, the one with the most overdue work, or the one worth opening next. Don't list — name the single thing that matters. Plain prose, no markdown.",
  project:
    "You are on a single Project's page. Default behavior (no refresh_mode in the payload): one paragraph (2-3 sentences). Look at its linked outcomes, open tasks, and this week's done count. Call out: the single smallest next action, a task that's too big and needs breakdown, or an outcome without enough task support. End with a concrete nudge. Plain prose, no markdown.\n\n" +
    "IF the payload includes `refresh_mode: \"interview\"`, switch to Project Refresh Interview mode. You are running a short guided refresh. Keep each message ≤3 sentences + one question. Walk through these steps in order — between steps use tools to read current state before asking, don't make the user tell you what the DB already knows:\n" +
    "  1. GOAL — call get_project_details. Confirm the one-line mantra still reflects the real goal. If not, propose a revision via update_project_workspace({mantra}).\n" +
    "  2. OUTCOMES — ask which desired outcomes this project feeds. Update via update_project_workspace({outcome_ids, life_domains}).\n" +
    "  3. KB — call get_project_knowledge. Ask what's stale or missing. Use update_project_knowledge(mode='append').\n" +
    "  4. TASKS — call analyze_project_plan. Ask which tasks to drop, which are too big (break down with create_subtasks), which need re-ordering (reorder_project_tasks). Apply one at a time.\n" +
    "  5. NEXT ACTION — identify the single next ≤30-minute action. If it doesn't exist as a task yet, offer to create_task it first. Then commit with update_project_workspace({next_action: {title, minutes, why, task_id, source: 'interview', needs_breakdown: false}, last_aligned_at: 'now'}).\n" +
    "  6. DONE — one sentence: 'You're aligned. Next 30 minutes: X. Today will rank it correctly.'\n" +
    "The user can redirect at any step ('skip KB', 'just the next action') — do less rather than more. Respect their time.",
  review:
    "You are on the Weekly Review page. The user is drafting their review in their own voice. One paragraph (2-3 sentences). The payload may include `week_context` — a day-by-day summary of what was going on that week (freeform notes + capacity chips + ongoing life situations + tasks spawned from each day's context). Use it to explain *why* a week went the way it did: 'You carried dad's recovery Mon–Wed; the friction section makes sense.' Mention what the data shows (projects that moved/didn't) and gently flag patterns they might miss. Respect that the handwritten fields are theirs — offer observations, don't rewrite them. Plain prose, no markdown.",
  fitness:
    "You are on the Body & Training page. One paragraph (2-3 sentences). Read the weekly plan and recent sessions: call out readiness, missed sessions, plateaus, or the next recommended session. Respect Occam rules — 48h recovery, 5s/5s cadence, 1×7+ on top set, add 2.5 lb if you hit 7+ on the last session, drop reps to 5 if you stall twice. Plain prose, no markdown.",
  ideas:
    "You are on the Ideas page. One paragraph (2-3 sentences). Point at what's ready to graduate, overlapping captures worth merging, or low-alignment ideas worth parking. Reference actual idea titles. End with a concrete nudge. Plain prose, no markdown.",
  jarvis:
    "You are in Jarvis — the system-wide chat. One short paragraph (1-2 sentences). Say that most of the conversation happens in the main panel now, and remind the user the right-rail is where they curate memory. Keep it brief. Plain prose, no markdown.",
  actions:
    "You are on the Action Items page. One paragraph (2-3 sentences). Spot imbalance: too many P0s (P0 = today only), projects with stalled tasks, urgent/important mismatches. Recommend pulling one high-leverage item to today or demoting stale P0s. Plain prose, no markdown.",
  notes:
    "You are on the Notes page. One paragraph (2-3 sentences). Notice patterns across notes — a theme the user keeps re-writing, pinned notes worth surfacing, or a topic that would benefit from a pinned entry. End with a concrete nudge. Plain prose, no markdown.",
  analytics:
    "You are on the Analytics page. One paragraph (2-3 sentences). Read the numbers the user is staring at — weekly momentum trend, outcome momentum, project alignment, human-need spread, time-of-day pattern. Call out the single pattern that should change a next best action this week (an outcome starving for effort, a trend that's slipping, a high-leverage project hiding in the data). Plain prose, no markdown.",
  account:
    "You are on the Account page. One short paragraph (1-2 sentences). This page is just credentials — email and password. Keep it light: confirm the user can change their login here, remind them a password change signs other devices out, and end. Plain prose, no markdown.",
};

// Resolve a scope name into its canonical form and its prompt-bucket.
// Accepts:
//   - static scopes (today, hits, project, etc.)
//   - aliases (backlog -> actions)
//   - parameterized scopes (project:<uuid> -> prompt bucket "project")
function resolveScope(rawScope) {
  const raw = String(rawScope || "");
  if (!raw) return { ok: false, scope: null, bucket: null };
  if (SCOPE_PROMPTS[raw]) return { ok: true, scope: raw, bucket: raw };
  if (SCOPE_ALIASES[raw]) {
    const alias = SCOPE_ALIASES[raw];
    return { ok: !!SCOPE_PROMPTS[alias], scope: alias, bucket: alias };
  }
  const colonIdx = raw.indexOf(":");
  if (colonIdx > 0) {
    const bucket = raw.slice(0, colonIdx);
    const aliased = SCOPE_ALIASES[bucket] || bucket;
    if (SCOPE_PROMPTS[aliased]) {
      // Keep the full parameterized scope as the storage key so each
      // instance (each project, etc.) gets its own conversation row set.
      return { ok: true, scope: raw, bucket: aliased };
    }
  }
  return { ok: false, scope: null, bucket: null };
}

async function loadHistory(userId, scope, limit = 30) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || [])
    .reverse()
    .filter((m) => m && (m.role === "user" || m.role === "assistant"));
}

async function saveMessage(userId, scope, role, content) {
  if (!content || !content.trim()) return null;
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      user_id: userId,
      role,
      content: content.slice(0, 8000),
      scope,
    })
    .select("id, role, content, created_at")
    .single();
  if (error) return null;
  return data;
}

async function clearHistory(userId, scope) {
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope);
  return !error;
}

export default async function handler(req, res) {
  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  // GET: return saved conversation for this scope
  if (req.method === "GET") {
    const resolved = resolveScope(req.query?.scope);
    if (!resolved.ok) {
      return res
        .status(400)
        .json({ error: `unknown scope: ${req.query?.scope}` });
    }
    const messages = await loadHistory(userId, resolved.scope, 30);
    return res.json({ ok: true, messages });
  }

  // DELETE: clear conversation for this scope
  if (req.method === "DELETE") {
    const resolved = resolveScope(req.query?.scope);
    if (!resolved.ok) {
      return res
        .status(400)
        .json({ error: `unknown scope: ${req.query?.scope}` });
    }
    await clearHistory(userId, resolved.scope);
    return res.json({ ok: true });
  }

  if (req.method !== "POST")
    return res.status(405).json({ error: "GET, POST, or DELETE" });

  const resolved = resolveScope(req.body?.scope);
  if (!resolved.ok) {
    return res
      .status(400)
      .json({ error: `unknown scope: ${req.body?.scope}` });
  }
  const scope = resolved.scope;
  const scopeBucket = resolved.bucket;
  const payload = req.body?.payload || {};
  const question = String(req.body?.question || "").trim().slice(0, 1000);
  // Server is the source of truth — pull recent history rather than
  // trusting client-supplied scrollback.
  const stored = await loadHistory(userId, scope, 12);
  const history = stored.map((m) => ({ role: m.role, content: m.content }));

  try {
    // Pull light user context: identity + top desired outcomes.
    const { data: profileRow } = await supabase
      .from("user_profile")
      .select("profile")
      .eq("user_id", userId)
      .maybeSingle();
    const profile = profileRow?.profile || {};
    const userContext = {
      identity: (profile.identity_attributes || []).slice(0, 6),
      desired_outcomes: (profile.desired_outcomes || [])
        .map((o) => o.title)
        .filter(Boolean)
        .slice(0, 5),
      thrive_goals: (profile.thrive_goals || []).slice(0, 4),
    };

    const system = question
      ? `You are the Rise & Shine coach. The user is on the ${scopeBucket} page and asked a direct question. Answer in 2-4 sentences, concrete and tied to the page state they're looking at. Reference actual titles/numbers when useful. No headings, no markdown.`
      : `You are the Rise & Shine page-scoped coach. ${SCOPE_PROMPTS[scopeBucket]}

The user is looking at the page RIGHT NOW — they don't want a lecture, they want one honest observation tied to what's visible. Be concrete, not generic. Reference actual titles/numbers from the payload when useful.`;

    const userPromptBase = `Page scope: ${scope}

User context (JSON):
${JSON.stringify(userContext, null, 2)}

Page state (JSON):
${JSON.stringify(payload, null, 2)}`;

    const messages = [];
    // Replay short recent history (user/assistant pairs) for continuity
    for (const h of history) {
      if (h?.role === "user" && typeof h.content === "string") {
        messages.push({ role: "user", content: h.content });
      } else if (h?.role === "assistant" && typeof h.content === "string") {
        messages.push({ role: "assistant", content: h.content });
      }
    }
    if (question) {
      messages.push({
        role: "user",
        content: `${userPromptBase}\n\nMy question: ${question}`,
      });
    } else {
      messages.push({
        role: "user",
        content: `${userPromptBase}\n\nWrite the coach note as described. Plain prose, 2-3 sentences. No headings, no markdown.`,
      });
    }

    // Tools are only available on follow-up questions, not on initial
    // page-load reads — keeps the first observation fast and
    // observation-only.
    const tools = question ? getToolDefinitions() : undefined;

    const toolSystemAddendum = question
      ? `

You have tools available for editing the user's data: create_task,
update_task, complete_task, create_subtasks, create_project,
update_project, update_project_knowledge, add_project_resource,
reorder_project_tasks, set_task_dependency, create_idea, add_daily_note,
plus read tools (get_backlog, get_categories, get_task_details, get_profile,
suggest_next_actions, etc.). Use them WHEN the user explicitly asks you to
DO something (edit, create, update, complete, prioritize, label, reorder).

Workflow when the user asks you to act:
1. If you need to find a task/project/category by name, call the relevant
   get_* tool first to look up its UUID. NEVER guess UUIDs.
2. Make the change with create_task / update_task / complete_task / etc.
3. Confirm in 1-2 sentences what you did, citing the title.

If the user is just asking a question, answer in 2-4 sentences without
calling tools.`
      : "";

    const finalSystem = system + toolSystemAddendum;

    const toolCallSummaries = [];
    let currentMessages = [...messages];
    let finalContent = "";
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      const result = await chatCompletion({
        system: finalSystem,
        messages: currentMessages,
        tools,
      });

      const roundContent = (result?.content || "").trim();
      const roundToolCalls = result?.toolCalls || null;

      if (!roundToolCalls || roundToolCalls.length === 0) {
        finalContent = roundContent;
        break;
      }

      // Replay the assistant's tool-call message back into the loop
      currentMessages.push({
        role: "assistant",
        content: roundContent,
        tool_calls: roundToolCalls,
      });

      // Execute each tool, push result messages back in
      for (const tc of roundToolCalls) {
        let toolResult;
        try {
          toolResult = await executeTool(tc.name, tc.args, userId);
          toolCallSummaries.push({
            name: tc.name,
            args: tc.args,
            ok: true,
          });
        } catch (toolErr) {
          toolResult = {
            error: `Tool execution failed: ${toolErr.message || toolErr}`,
          };
          toolCallSummaries.push({
            name: tc.name,
            args: tc.args,
            ok: false,
            error: toolResult.error,
          });
        }
        currentMessages.push({
          role: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      if (result.stopReason === "end_turn") {
        finalContent = roundContent;
        break;
      }
    }

    const note = (finalContent || "").trim();
    if (!note && toolCallSummaries.length === 0) {
      return res.status(502).json({ error: "AI returned no content." });
    }

    // Persist user question + final assistant text to chat_messages
    // (not the tool_call rows — they only matter within the turn).
    if (question) {
      await saveMessage(userId, scope, "user", question);
    }
    if (note) {
      await saveMessage(userId, scope, "assistant", note);
    }

    return res.json({
      ok: true,
      note,
      tool_calls: toolCallSummaries,
    });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to generate coach note." });
  }
}
