// Builds the dynamic system prompt for Jarvis chat agent
// Includes static persona + live user context

import { createClient } from "@supabase/supabase-js";
import { TIMEZONE } from "./scoring.js";
import { getPageCoachDigest } from "./jarvis-context.js";
import { searchMemories } from "./memories.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

const PERSONA = `You are Jarvis, the Rise & Shine execution coach. You help the user move toward their goals by identifying and optimizing their next right actions.

Your personality:
- Calm, direct, and encouraging — like a sharp friend who genuinely wants you to win
- You cut through overwhelm and surface what actually matters today
- You ask clarifying questions when a request is vague rather than guessing
- You're proactive: if you notice something off (overdue tasks, neglected domains, broken streaks), mention it

Your capabilities:
- **Read**: Look up the daily queue, full backlog, profile/vision, task details, analytics, categories, weekly reviews, ideas, and notes
- **Create**: Create tasks, subtasks, entire projects (category + tasks), and ideas from conversation
- **Update**: Change task titles, priorities, effort, due dates, tags, status, and categories
- **Complete**: Mark tasks as done (logs completion events for streaks/analytics)
- **Notes**: Add or update daily journal entries
- Always use your tools to look up real data before answering questions. Never guess or fabricate task data.
- When creating tasks, use verb-first titles (e.g., "Schedule dentist appointment", not "Dentist appointment")
- When the user describes a situation, proactively break it into a project with concrete tasks — don't just advise
- Look up categories with get_categories before creating tasks so you assign them to the right project
- **Coaching**: Use suggest_next_actions to recommend what to work on. Use weekly_review_summary to walk through weekly reviews.
- **Nudges**: Use check_nudges to detect overdue tasks, streak status, stale items, and other conditions worth mentioning.
- **Projects**: Use get_project_details and get_project_knowledge to understand a project's full context before giving advice. Use update_project_knowledge when the user shares project info (contacts, reference numbers, specs, dates). Use add_project_resource to track links and documents. When the user describes a new project or situation, use create_project to set it up, then create tasks as high-level phases.
- **Ordering & Dependencies**: Use analyze_project_plan to review a project's task sequence and dependencies. Present your recommended order with reasoning for each position. Wait for user approval before calling reorder_project_tasks or reorder_subtasks to apply. Use set_task_dependency to mark tasks as blocked by others. The user may manually drag tasks to adjust after you reorder — that's expected. If asked to re-analyze, read the current order (which may have been manually changed) and suggest updates from there.

How to behave:
- Keep responses concise. Use short paragraphs and bullet points.
- When discussing tasks, reference them by title. Include category when helpful.
- When the user describes a situation or problem, help them think through it and identify concrete next actions. Then offer to create them.
- When creating multiple tasks, briefly confirm what you'll create before doing it, unless the user has clearly spelled out what they want.
- During weekly reviews, walk them through: what went well, what needs attention, what to focus on next week. Use weekly_review_summary to get the data.
- When you notice patterns (e.g., a domain getting neglected, a project stalling), surface it proactively.
- When the user's first message is "[auto-greeting]", use check_nudges to see what needs attention, then give a brief, friendly status update. Don't just list nudges mechanically — weave them into a natural greeting.
- When a conversation reaches a natural end (user says thanks, goodbye, that's all, or you've completed a significant block of work), use save_session_summary to record what was discussed and decided. This lets you remember across sessions.
- Don't be preachy or lecture. Be practical.`;

const PROMPT_TIMEOUT_MS = 8000;
const MEMORY_RETRIEVAL_TOP_K = 6;

/**
 * Build the full system prompt with live context and warm-tier memory injection.
 * Times out after 8 seconds — returns persona-only prompt if context loading is too slow.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.scope]  conversation scope (e.g. "project:<category_id>")
 * @param {string} [opts.query]  the user's latest message; used as the query
 *                               for semantic memory retrieval. When omitted,
 *                               falls back to recent-importance ordering only.
 * @returns {Promise<string>}
 */
export async function buildSystemPrompt(userId, opts = {}) {
  return Promise.race([
    buildSystemPromptInner(userId, opts),
    new Promise((resolve) =>
      setTimeout(() => resolve(personaOnly()), PROMPT_TIMEOUT_MS)
    ),
  ]);
}

function personaOnly() {
  return `<persona>\n${PERSONA}\n</persona>`;
}

async function buildSystemPromptInner(userId, opts = {}) {
  const { scope, query } = opts;
  const today = todayStr();
  const contextParts = [`Current date: ${today}`];

  try {
    // Fetch profile summary
    const { data: profileRow } = await supabase
      .from("user_profile")
      .select("profile")
      .eq("user_id", userId)
      .maybeSingle();
    const profile = profileRow?.profile;

    if (profile) {
      const outcomes = (profile.desired_outcomes || [])
        .map((o) => o.title)
        .filter(Boolean)
        .slice(0, 5);
      if (outcomes.length > 0) {
        contextParts.push(`User's desired outcomes: ${outcomes.join(", ")}`);
      }
      if (profile.quarter_focus?.length > 0) {
        contextParts.push(`Quarter focus: ${profile.quarter_focus.join(", ")}`);
      }
      if (profile.identity_attributes) {
        const identity = typeof profile.identity_attributes === "string"
          ? profile.identity_attributes
          : JSON.stringify(profile.identity_attributes);
        contextParts.push(`Identity: ${identity.slice(0, 200)}`);
      }
    }

    // Today's queue status
    const { data: plan } = await supabase
      .from("daily_plans")
      .select("mode, queue")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (plan?.queue?.length > 0) {
      const taskIds = plan.queue.map((q) => q.task_id).filter(Boolean);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", taskIds);
      const taskMap = Object.fromEntries((tasks || []).map((t) => [t.id, t.title]));

      const queueSummary = plan.queue
        .map((q) => `${q.slot}. ${taskMap[q.task_id] || "Unknown"}`)
        .join("; ");
      contextParts.push(`Today's mode: ${plan.mode}`);
      contextParts.push(`Today's queue: ${queueSummary}`);
    } else {
      contextParts.push("Today's queue: not yet set up");
    }

    // Today's real-life context: capacity chip, pinned life situations,
    // and the freeform daily-notes dump. This is what the user is actually
    // dealing with — Jarvis should scale ambition and suggestions to it.
    try {
      const prefs = (profile && profile.preferences) || {};
      const capacity = prefs.daily_capacity ? prefs.daily_capacity[today] : null;
      const situations = Array.isArray(prefs.life_situations)
        ? prefs.life_situations.filter((s) => !s.archived_at)
        : [];
      const { data: dailyNote } = await supabase
        .from("daily_notes")
        .select("note")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();
      const rawNote = (dailyNote?.note || "").trim();
      const hasContext = capacity || situations.length > 0 || rawNote;
      if (hasContext) {
        contextParts.push("");
        contextParts.push("Today's real-life context:");
        if (capacity) {
          contextParts.push(`- Capacity: ${capacity} (scale ambition accordingly)`);
        }
        if (situations.length > 0) {
          const list = situations
            .slice(0, 6)
            .map((s) => (s.opened_on ? `${s.label} (since ${s.opened_on})` : s.label))
            .join("; ");
          contextParts.push(`- Ongoing: ${list}`);
        }
        if (rawNote) {
          contextParts.push(`- Today's dump: ${rawNote.slice(0, 500)}`);
        }
      }
    } catch {
      // silent — context is nice-to-have
    }

    // This week's completion count
    const weekStart = getMonday(today);
    const { count: weekCompletions } = await supabase
      .from("task_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", `${weekStart}T00:00:00`);

    contextParts.push(`Tasks completed this week: ${weekCompletions || 0}`);

    // Parallel queries: overdue, projects, yesterday's completions, streak, due today
    const yesterday = getPrevDay(today);
    const [overdueRes, projectsRes, yesterdayRes, dueTodayRes, streakRes, sessionRes] = await Promise.all([
      // Overdue count
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["todo", "doing"])
        .lt("due_date", today),
      // Top projects with task counts
      buildProjectBriefing(userId, today),
      // Yesterday's completions
      supabase
        .from("task_events")
        .select("task_id")
        .eq("user_id", userId)
        .eq("event_type", "completed")
        .gte("created_at", `${yesterday}T00:00:00`)
        .lte("created_at", `${yesterday}T23:59:59`),
      // Tasks due today
      supabase
        .from("tasks")
        .select("id, title, category:categories(name)")
        .eq("user_id", userId)
        .in("status", ["todo", "doing"])
        .eq("due_date", today)
        .limit(5),
      // Streak (days with completions counting back from today)
      computeStreak(userId, today),
      // Recent session summaries
      supabase
        .from("jarvis_session_summaries")
        .select("summary, topics, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const overdueCount = overdueRes.count || 0;
    if (overdueCount > 0) {
      contextParts.push(`Overdue tasks: ${overdueCount}`);
    }

    // Due today
    const dueToday = dueTodayRes.data || [];
    if (dueToday.length > 0) {
      const dueTitles = dueToday.map((t) => `"${t.title}" (${t.category?.name || "?"})`).join(", ");
      contextParts.push(`Due today: ${dueTitles}`);
    }

    // Yesterday's completions
    const yesterdayCount = new Set((yesterdayRes.data || []).map((e) => e.task_id)).size;
    if (yesterdayCount > 0) {
      contextParts.push(`Yesterday: ${yesterdayCount} task${yesterdayCount > 1 ? "s" : ""} completed`);
    }

    // Streak
    if (streakRes > 0) {
      contextParts.push(`Current streak: ${streakRes} day${streakRes > 1 ? "s" : ""}`);
    }

    // Project briefing
    if (projectsRes.length > 0) {
      contextParts.push("");
      contextParts.push("Active projects:");
      for (const p of projectsRes) {
        let line = `- ${p.name}: ${p.open} open, ${p.done} done`;
        if (p.overdue > 0) line += `, ${p.overdue} overdue`;
        if (p.nextAction) line += ` | Next: "${p.nextAction}"`;
        if (p.mantra) line += ` | "${p.mantra}"`;
        if (p.hasKB) line += " [KB]";
        contextParts.push(line);
      }
    }

    // Recent session summaries (memory)
    const sessions = sessionRes?.data || [];
    if (sessions.length > 0) {
      contextParts.push("");
      contextParts.push("Recent sessions:");
      for (const s of sessions) {
        const date = s.created_at?.slice(0, 10) || "?";
        contextParts.push(`- ${date}: ${s.summary}`);
      }
    }

    // Summary of recent per-page coach conversations so Jarvis knows
    // what the user already discussed on Today, Daily Hits, Project
    // pages, etc. These are separate threads but part of the user's
    // running context with the system.
    try {
      const digest = await getPageCoachDigest(userId, 6);
      if (digest && digest.length > 0) {
        contextParts.push("");
        contextParts.push(
          "Recent page-coach conversations (separate threads, this context only — don't repeat verbatim):"
        );
        for (const d of digest) {
          const when = d.last_at ? d.last_at.slice(0, 10) : "?";
          const label = d.label || d.scope;
          contextParts.push(
            `- ${label} (${d.turns} turns, last ${when}): user asked "${d.last_user_question || "…"}"; coach replied "${d.last_coach_reply || "…"}"`
          );
        }
      }
    } catch {
      // silent — digest is nice-to-have
    }

    // User-curated notes flagged with jarvis_feed=true
    const { data: feedNotes } = await supabase
      .from("notes")
      .select("title, body, created_at")
      .eq("user_id", userId)
      .eq("jarvis_feed", true)
      .order("created_at", { ascending: false })
      .limit(20);
    if (feedNotes && feedNotes.length > 0) {
      contextParts.push("");
      contextParts.push("User-curated notes (flagged 'Feed Jarvis' on /notes):");
      let noteBudget = 2000; // chars
      for (const n of feedNotes) {
        const date = n.created_at?.slice(0, 10) || "?";
        const heading = n.title ? `[${date}] ${n.title}` : `[${date}]`;
        const body = (n.body || "").slice(0, 280);
        const block = `- ${heading}\n  ${body}`;
        if (noteBudget - block.length < 0) break;
        contextParts.push(block);
        noteBudget -= block.length;
      }
    }
  } catch (err) {
    contextParts.push(`(Context loading error: ${err.message})`);
  }

  // --- Warm-tier memory retrieval ---------------------------------------
  // Pulls top-K memories from the `memories` table by semantic similarity
  // to the user's latest message (if any), filtered to the conversation
  // scope when one was passed.
  const memoryLines = [];
  try {
    const scopeFilter = parseScope(scope);
    if (query && query.trim()) {
      const hits = await searchMemories(userId, {
        query,
        scope_type: scopeFilter?.scope_type,
        scope_id: scopeFilter?.scope_id,
        top_k: MEMORY_RETRIEVAL_TOP_K,
        markUsed: true,
      });
      for (const m of hits) {
        memoryLines.push(formatMemoryLine(m));
      }
    }
  } catch {
    // silent — memory layer is best-effort augmentation
  }

  // --- Compose final prompt with section anchors -----------------------
  const sections = [];
  sections.push(`<persona>\n${PERSONA}\n</persona>`);
  sections.push(`<live_context>\n${contextParts.join("\n")}\n</live_context>`);
  if (memoryLines.length > 0) {
    sections.push(
      `<recent_memories>\nDurable facts retrieved for this turn. Use as context; do not repeat verbatim.\n${memoryLines.join("\n")}\n</recent_memories>`
    );
  }
  return sections.join("\n\n");
}

function parseScope(scope) {
  if (!scope || typeof scope !== "string") return null;
  // Forms we support: "project:<uuid>" | "task:<uuid>" | "outcome:<id>" | "today" | "review"
  const [kind, ...rest] = scope.split(":");
  const id = rest.join(":") || null;
  if (["project", "task", "outcome", "person"].includes(kind) && id) {
    return { scope_type: kind, scope_id: id };
  }
  return null;
}

function formatMemoryLine(m) {
  const kind = m.kind?.padEnd(12) || "memory";
  const scope =
    m.scope_type === "global"
      ? ""
      : m.scope_id
        ? ` [${m.scope_type}:${String(m.scope_id).slice(0, 8)}]`
        : ` [${m.scope_type}]`;
  return `- (${kind})${scope} ${m.content}`;
}

function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function getPrevDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function buildProjectBriefing(userId, today) {
  try {
    // Get categories with weights
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId);
    if (!categories || categories.length === 0) return [];

    const catIds = categories.map((c) => c.id);

    // Get all open tasks across projects
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, category_id, parent_task_id")
      .eq("user_id", userId)
      .in("category_id", catIds)
      .in("status", ["todo", "doing", "done"]);

    // Get workspace mantras + KB presence
    const { data: workspaces } = await supabase
      .from("shared_project_workspaces")
      .select("category_id, workspace, knowledge_base")
      .in("category_id", catIds);

    const wsMap = {};
    for (const ws of workspaces || []) {
      wsMap[ws.category_id] = {
        mantra: ws.workspace?.mantra || "",
        hasKB: !!(ws.knowledge_base && ws.knowledge_base.trim()),
      };
    }

    const BASE_WEIGHTS = { Business: 5, "Rental House": 4, Vehicles: 3, Home: 2, Boat: 1, Personal: 2 };
    const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };

    const projects = categories.map((cat) => {
      const catTasks = (tasks || []).filter((t) => t.category_id === cat.id && !t.parent_task_id);
      const open = catTasks.filter((t) => t.status === "todo" || t.status === "doing").length;
      const done = catTasks.filter((t) => t.status === "done").length;
      const overdue = catTasks.filter(
        (t) => t.due_date && t.due_date < today && t.status !== "done"
      ).length;

      // Next action: top undone root by priority
      const undone = catTasks
        .filter((t) => t.status !== "done")
        .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

      const ws = wsMap[cat.id] || {};
      const weight = BASE_WEIGHTS[cat.name] || 1;

      return {
        name: cat.name,
        open,
        done,
        overdue,
        nextAction: undone[0]?.title || null,
        mantra: ws.mantra || "",
        hasKB: ws.hasKB || false,
        weight,
      };
    });

    // Sort by weight descending, take top 5 with open tasks
    return projects
      .filter((p) => p.open > 0 || p.overdue > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function computeStreak(userId, today) {
  try {
    // Single query: get distinct completion dates for the last 30 days
    const thirtyDaysAgo = new Date(new Date(today).getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: events } = await supabase
      .from("task_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", `${thirtyDaysAgo}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`);

    // Extract unique dates
    const datesWithCompletions = new Set(
      (events || []).map((e) => e.created_at.slice(0, 10))
    );

    // Count consecutive days walking backward from today
    let streak = 0;
    const d = new Date(today);
    for (let i = 0; i <= 30; i++) {
      const ds = d.toISOString().slice(0, 10);
      if (datesWithCompletions.has(ds)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        // If today has no completions, that's ok — check from yesterday
        if (i === 0) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
}
