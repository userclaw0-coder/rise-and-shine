// Jarvis tool definitions and executors
// Each tool wraps existing DB queries using the service-role supabase client
// Phase 1: read-only tools only

import { createClient } from "@supabase/supabase-js";
import { TIMEZONE } from "./scoring";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function weekStartStr(dateStr) {
  const d = new Date(dateStr || todayStr());
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  return d.toISOString().slice(0, 10);
}

// --- Tool definitions (Anthropic tool_use format) ---

const TOOL_DEFINITIONS = [
  {
    name: "get_todays_queue",
    description:
      "Get the user's current Next-3 daily task queue for today, including task details, mode, and completion status. Use this to understand what the user should be working on right now.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format. Defaults to today.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_backlog",
    description:
      "Get all open tasks from the user's backlog. Supports filtering by status, category, and priority. Use this to understand the full scope of work.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "doing", "all"],
          description: "Filter by status. Defaults to all non-archived.",
        },
        category: {
          type: "string",
          description: "Filter by category name (case-insensitive partial match).",
        },
        priority: {
          type: "string",
          enum: ["Critical", "High", "Medium", "Low"],
          description: "Filter by priority level.",
        },
        include_archived: {
          type: "boolean",
          description: "Include archived tasks. Default false.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_profile",
    description:
      "Get the user's profile including their vision, desired outcomes, life domains, energy profile, quarter focus, and preferences. Use this to understand the user's goals and priorities.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_task_details",
    description:
      "Get detailed information about a specific task including its tags, subtasks, and recent events.",
    input_schema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The UUID of the task to look up.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "get_analytics",
    description:
      "Get completion analytics for a time period. Returns completed task counts by day, category breakdown, and streak information.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["7d", "30d", "90d"],
          description: "Time period to analyze. Defaults to 7d.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_categories",
    description:
      "Get all project categories and their subcategories. Use this to understand the user's project structure.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_weekly_review",
    description:
      "Get the user's weekly review notes and any AI coaching suggestions for a given week. Use this to understand recent reflection and improvement focus.",
    input_schema: {
      type: "object",
      properties: {
        week_start: {
          type: "string",
          description: "Monday date in YYYY-MM-DD format. Defaults to current week.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_ideas",
    description:
      "Get the user's ideas inbox. Ideas are lightweight captures that can be promoted to tasks.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_recent_notes",
    description:
      "Get the user's recent daily journal notes.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent notes to return. Default 10.",
        },
      },
      required: [],
    },
  },
];

// --- Tool executors ---

async function execGetTodaysQueue(params, userId) {
  const date = params.date || todayStr();

  const { data: plan, error: planErr } = await supabase
    .from("daily_plans")
    .select("id, date, mode, queue, refill_policy, refilled_count, created_at")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan || !plan.queue || plan.queue.length === 0) {
    return { date, mode: plan?.mode || null, queue: [], message: "No queue set for this date." };
  }

  const taskIds = plan.queue.map((q) => q.task_id).filter(Boolean);
  if (taskIds.length === 0) {
    return { date, mode: plan.mode, queue: plan.queue, tasks: [] };
  }

  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, effort_hours, due_date, category:categories(name), tags:task_tags(tag:tags(name)), parent_task_id, outcome_ids, primary_life_domain"
    )
    .in("id", taskIds);
  if (taskErr) throw taskErr;

  // Get today's completion events
  const { data: events } = await supabase
    .from("task_events")
    .select("task_id, event_type, created_at")
    .eq("user_id", userId)
    .in("task_id", taskIds)
    .eq("event_type", "completed")
    .gte("created_at", `${date}T00:00:00`)
    .lte("created_at", `${date}T23:59:59`);

  const completedSet = new Set((events || []).map((e) => e.task_id));
  const taskMap = Object.fromEntries((tasks || []).map((t) => [t.id, t]));

  const enrichedQueue = plan.queue.map((q) => {
    const task = taskMap[q.task_id];
    return {
      slot: q.slot,
      type: q.type,
      task_id: q.task_id,
      completed_today: completedSet.has(q.task_id),
      task: task
        ? {
            title: task.title,
            status: task.status,
            priority: task.priority,
            effort_hours: task.effort_hours,
            due_date: task.due_date,
            category: task.category?.name || null,
            tags: (task.tags || []).map((t) => t.tag?.name).filter(Boolean),
            is_subtask: !!task.parent_task_id,
          }
        : null,
    };
  });

  return { date, mode: plan.mode, refill_count: plan.refilled_count, queue: enrichedQueue };
}

async function execGetBacklog(params, userId) {
  let q = supabase
    .from("tasks")
    .select(
      "id, title, status, priority, effort_hours, due_date, created_at, parent_task_id, category:categories(name), tags:task_tags(tag:tags(name)), outcome_ids, primary_life_domain"
    )
    .eq("user_id", userId);

  if (!params.include_archived) {
    q = q.neq("status", "archived");
  }
  if (params.status && params.status !== "all") {
    q = q.eq("status", params.status);
  }
  if (params.priority) {
    q = q.eq("priority", params.priority);
  }

  const { data: tasks, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;

  let result = (tasks || []).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    effort_hours: t.effort_hours,
    due_date: t.due_date,
    category: t.category?.name || null,
    tags: (t.tags || []).map((tg) => tg.tag?.name).filter(Boolean),
    is_subtask: !!t.parent_task_id,
    primary_life_domain: t.primary_life_domain,
  }));

  if (params.category) {
    const cat = params.category.toLowerCase();
    result = result.filter((t) => t.category && t.category.toLowerCase().includes(cat));
  }

  return { count: result.length, tasks: result };
}

async function execGetProfile(_params, userId) {
  const { data, error } = await supabase
    .from("user_profile")
    .select("profile, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { message: "No profile found. User may need to complete onboarding." };
  const p = data.profile || {};
  return {
    identity: p.identity_attributes || null,
    desired_outcomes: p.desired_outcomes || [],
    life_domains: p.life_domains || null,
    quarter_focus: p.quarter_focus || [],
    energy_profile: p.energy_profile || null,
    leverage_focus: p.leverage_focus || null,
    immediate_step: p.immediate_step || null,
    thrive_goals: p.thrive_goals || null,
    preferences: p.preferences || null,
    updated_at: data.updated_at,
  };
}

async function execGetTaskDetails(params, userId) {
  const { data: task, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, effort_hours, due_date, created_at, updated_at, parent_task_id, archived_at, category:categories(name), subcategory:subcategories(name), tags:task_tags(tag:tags(name)), outcome_ids, primary_life_domain, life_domains, alignment_source"
    )
    .eq("id", params.task_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!task) return { error: "Task not found." };

  // Get subtasks
  const { data: subtasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, effort_hours")
    .eq("parent_task_id", params.task_id)
    .eq("user_id", userId)
    .order("created_at");

  // Get recent events
  const { data: events } = await supabase
    .from("task_events")
    .select("event_type, value, created_at")
    .eq("task_id", params.task_id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    ...task,
    category: task.category?.name || null,
    subcategory: task.subcategory?.name || null,
    tags: (task.tags || []).map((t) => t.tag?.name).filter(Boolean),
    subtasks: subtasks || [],
    recent_events: (events || []).map((e) => ({
      type: e.event_type,
      value: e.value,
      at: e.created_at,
    })),
  };
}

async function execGetAnalytics(params, userId) {
  const days = params.period === "90d" ? 90 : params.period === "30d" ? 30 : 7;
  const end = todayStr();
  const start = new Date(new Date(end).getTime() - days * 86400000).toISOString().slice(0, 10);

  const { data: events, error } = await supabase
    .from("task_events")
    .select("task_id, event_type, created_at, value")
    .eq("user_id", userId)
    .eq("event_type", "completed")
    .gte("created_at", `${start}T00:00:00`)
    .lte("created_at", `${end}T23:59:59`);
  if (error) throw error;

  // Count by day
  const byDay = {};
  for (const e of events || []) {
    const day = e.created_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  // Get task details for category breakdown
  const taskIds = [...new Set((events || []).map((e) => e.task_id))];
  let categoryBreakdown = {};
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, category:categories(name)")
      .in("id", taskIds);
    for (const t of tasks || []) {
      const cat = t.category?.name || "Uncategorized";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    }
  }

  // Streak calculation
  let streak = 0;
  const d = new Date(end);
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (byDay[ds]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    period: `${days}d`,
    start,
    end,
    total_completions: (events || []).length,
    unique_tasks_completed: taskIds.length,
    completions_by_day: byDay,
    category_breakdown: categoryBreakdown,
    current_streak_days: streak,
  };
}

async function execGetCategories(_params, userId) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, subcategories(id, name)")
    .eq("user_id", userId)
    .order("name");
  if (error) throw error;
  return { categories: data || [] };
}

async function execGetWeeklyReview(params, userId) {
  const ws = params.week_start || weekStartStr();

  const { data: review, error: revErr } = await supabase
    .from("human_needs_weekly")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", ws)
    .maybeSingle();

  const { data: run, error: runErr } = await supabase
    .from("weekly_improvement_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", ws)
    .eq("source", "weekly_coach")
    .maybeSingle();

  if (revErr) throw revErr;
  if (runErr) throw runErr;

  return {
    week_start: ws,
    review: review
      ? {
          wins: review.wins,
          friction: review.friction,
          week_summary: review.week_summary,
          weekly_theme: review.weekly_theme,
          lowest_need_focus: review.lowest_need_focus,
          updated_human_needs: review.updated_human_needs,
          reality_check: review.reality_check,
        }
      : null,
    coach: run
      ? {
          status: run.status,
          summary: run.ai_output?.summary || null,
          next_week_focus: run.ai_output?.next_week_focus || null,
          suggestion_count:
            (run.ai_output?.project_fixes?.length || 0) +
            (run.ai_output?.alignment_fixes?.length || 0) +
            (run.ai_output?.subtask_suggestions?.length || 0) +
            (run.ai_output?.priority_adjustments?.length || 0),
          accepted: run.accepted_action_ids?.length || 0,
          applied: run.applied_action_ids?.length || 0,
        }
      : null,
  };
}

async function execGetIdeas(_params, userId) {
  const { data, error } = await supabase
    .from("ideas")
    .select("id, title, details, status, created_at")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return { count: (data || []).length, ideas: data || [] };
}

async function execGetRecentNotes(params, userId) {
  const limit = params.limit || 10;
  const { data, error } = await supabase
    .from("daily_notes")
    .select("id, date, note, created_at")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { count: (data || []).length, notes: data || [] };
}

// --- Registry ---

const EXECUTORS = {
  get_todays_queue: execGetTodaysQueue,
  get_backlog: execGetBacklog,
  get_profile: execGetProfile,
  get_task_details: execGetTaskDetails,
  get_analytics: execGetAnalytics,
  get_categories: execGetCategories,
  get_weekly_review: execGetWeeklyReview,
  get_ideas: execGetIdeas,
  get_recent_notes: execGetRecentNotes,
};

/**
 * Get all tool definitions for passing to the AI provider.
 */
export function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

/**
 * Execute a tool by name.
 * @param {string} name
 * @param {object} params
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function executeTool(name, params, userId) {
  const executor = EXECUTORS[name];
  if (!executor) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await executor(params || {}, userId);
  } catch (err) {
    return { error: err.message || String(err) };
  }
}
