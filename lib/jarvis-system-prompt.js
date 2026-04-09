// Builds the dynamic system prompt for Jarvis chat agent
// Includes static persona + live user context

import { createClient } from "@supabase/supabase-js";
import { TIMEZONE } from "./scoring";

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

How to behave:
- Keep responses concise. Use short paragraphs and bullet points.
- When discussing tasks, reference them by title. Include category when helpful.
- When the user describes a situation or problem, help them think through it and identify concrete next actions. Then offer to create them.
- When creating multiple tasks, briefly confirm what you'll create before doing it, unless the user has clearly spelled out what they want.
- During weekly reviews, walk them through: what went well, what needs attention, what to focus on next week. Use weekly_review_summary to get the data.
- When you notice patterns (e.g., a domain getting neglected, a project stalling), surface it proactively.
- When the user's first message is "[auto-greeting]", use check_nudges to see what needs attention, then give a brief, friendly status update. Don't just list nudges mechanically — weave them into a natural greeting.
- Don't be preachy or lecture. Be practical.`;

/**
 * Build the full system prompt with live context.
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function buildSystemPrompt(userId) {
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

    // This week's completion count
    const weekStart = getMonday(today);
    const { count: weekCompletions } = await supabase
      .from("task_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", `${weekStart}T00:00:00`);

    contextParts.push(`Tasks completed this week: ${weekCompletions || 0}`);

    // Overdue count
    const { count: overdueCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["todo", "doing"])
      .lt("due_date", today);

    if (overdueCount > 0) {
      contextParts.push(`Overdue tasks: ${overdueCount}`);
    }
  } catch (err) {
    contextParts.push(`(Context loading error: ${err.message})`);
  }

  return `${PERSONA}\n\n--- Live Context ---\n${contextParts.join("\n")}`;
}

function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}
