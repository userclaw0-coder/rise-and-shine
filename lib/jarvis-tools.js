// Jarvis tool definitions and executors
// Each tool wraps existing DB queries using the service-role supabase client
// Phase 1: read-only tools | Phase 2: write tools

import { createClient } from "@supabase/supabase-js";
import { TIMEZONE } from "./scoring";
import { detectNudges } from "./jarvis-nudges";

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

  // --- Phase 2: Write tools ---

  {
    name: "create_task",
    description:
      "Create a new task in the user's backlog. Use this when the user describes something they need to do, or when breaking down a situation into actionable items. Always look up categories first to assign the right one.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title. Use verb-first format (e.g., 'Schedule dentist appointment').",
        },
        category_id: {
          type: "string",
          description: "UUID of the category/project. Use get_categories to find the right one.",
        },
        priority: {
          type: "string",
          enum: ["Critical", "High", "Medium", "Low"],
          description: "Priority level. Default Medium.",
        },
        effort_hours: {
          type: "number",
          description: "Estimated effort in hours (e.g., 0.5 for 30 min).",
        },
        due_date: {
          type: "string",
          description: "Due date in YYYY-MM-DD format. Only set if there's a real deadline.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags like quick-win, high-leverage, urgent, deep, physical, low-energy.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update an existing task's properties. Use get_task_details or get_backlog first to find the task_id.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task to update." },
        title: { type: "string", description: "New title." },
        priority: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
        effort_hours: { type: "number", description: "Updated effort estimate in hours." },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD, or null to clear." },
        status: { type: "string", enum: ["todo", "doing", "archived"], description: "New status." },
        category_id: { type: "string", description: "Move to a different category." },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Replace all tags with this list. Use get_task_details to see current tags first.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description:
      "Mark a task as completed. Logs a completion event for analytics/streaks.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task to complete." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "create_subtasks",
    description:
      "Create multiple subtasks under a parent task. Use this to break down a large task into smaller next actions.",
    input_schema: {
      type: "object",
      properties: {
        parent_task_id: {
          type: "string",
          description: "UUID of the parent task.",
        },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
              effort_hours: { type: "number" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
          },
          description: "List of subtasks to create.",
        },
      },
      required: ["parent_task_id", "subtasks"],
    },
  },
  {
    name: "create_project",
    description:
      "Create a new project (category) with optional initial tasks. Use this when the user describes a new initiative, situation, or area of responsibility that needs its own project.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project/category name (e.g., 'Bathroom Remodel', 'Q2 Marketing').",
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
              effort_hours: { type: "number" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
          },
          description: "Initial tasks to create in the project.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "create_idea",
    description:
      "Capture an idea in the ideas inbox. Use this for things that aren't actionable yet but worth remembering.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Idea title." },
        details: { type: "string", description: "Optional details or context." },
      },
      required: ["title"],
    },
  },
  {
    name: "add_daily_note",
    description:
      "Add or update the user's daily journal note for a given date.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
        content: { type: "string", description: "Note content." },
      },
      required: ["content"],
    },
  },

  // --- Phase 3: Coaching tools ---

  {
    name: "suggest_next_actions",
    description:
      "Analyze the user's backlog and suggest the best tasks to focus on right now based on scoring, priorities, due dates, and alignment to outcomes. Use this when the user asks what to work on, or to help them decide between options.",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of suggestions. Default 5." },
        mode: {
          type: "string",
          enum: ["Strategic Push", "Build & Physical", "Deep Cognitive", "Maintenance", "Light/Reset"],
          description: "Scoring mode to use. Default Strategic Push.",
        },
      },
      required: [],
    },
  },
  {
    name: "weekly_review_summary",
    description:
      "Generate a comprehensive weekly review summary with completion stats, category breakdown, streak info, stale tasks, overdue items, and domain coverage. Use this to walk the user through their weekly review.",
    input_schema: {
      type: "object",
      properties: {
        week_start: { type: "string", description: "Monday date in YYYY-MM-DD. Defaults to current week." },
      },
      required: [],
    },
  },
  {
    name: "check_nudges",
    description:
      "Check for conditions that need the user's attention: overdue tasks, streak status, stale in-progress items, queue status, weekly review due. Use this proactively at the start of conversations.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  // --- Phase: Project management tools ---

  {
    name: "get_project_details",
    description:
      "Get full project info: mantra, narrative, knowledge base, resource links, all tasks with subtasks, alignment stats, and progress. Use this when discussing a specific project.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
      },
      required: ["category_id"],
    },
  },
  {
    name: "update_project",
    description:
      "Update a project's strategic brief — mantra (one-liner) and/or narrative (long-form strategy document).",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        mantra: { type: "string", description: "One-line project intent." },
        narrative: { type: "string", description: "Long-form strategic narrative." },
      },
      required: ["category_id"],
    },
  },
  {
    name: "get_project_knowledge",
    description:
      "Get a project's knowledge base (extracted facts, contacts, reference numbers, etc.) and resource links. Use this to understand what information and documents exist for a project.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
      },
      required: ["category_id"],
    },
  },
  {
    name: "update_project_knowledge",
    description:
      "Append to or replace a project's knowledge base. Use this when the user shares project information (contacts, reference numbers, dates, specs) that should be stored for future planning.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        content: { type: "string", description: "Knowledge base content to set or append." },
        mode: { type: "string", enum: ["replace", "append"], description: "Replace entire KB or append to it. Default append." },
      },
      required: ["category_id", "content"],
    },
  },
  {
    name: "add_project_resource",
    description:
      "Add a resource link to a project (document, folder, portal URL, contact reference). Use this when the user shares a link or reference that should be tracked.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        label: { type: "string", description: "Resource label (e.g., 'Insurance Policy', 'County Portal')." },
        url: { type: "string", description: "URL or link to the resource." },
        kind: { type: "string", enum: ["document", "folder", "link", "contact", "credential"], description: "Type of resource." },
        status: { type: "string", enum: ["active", "pending", "expired", "reference"], description: "Current status. Default active." },
        notes: { type: "string", description: "One-liner context (e.g., 'Approved 2025-11, valid 2 years')." },
      },
      required: ["category_id", "label"],
    },
  },
  {
    name: "get_recent_import_summary",
    description:
      "Get a summary of recent external AI import sessions for a project. Use this to understand what was imported from Claude Projects or other AI planning sessions, so you can follow up on imported tasks.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
      },
      required: ["category_id"],
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

// --- Phase 2: Write executors ---

async function execCreateTask(params, userId) {
  // Get category ID - use provided or fall back to first category
  let categoryId = params.category_id || null;
  if (!categoryId) {
    const { data: firstCat } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    categoryId = firstCat?.id || null;
    if (!categoryId) throw new Error("No categories exist. Create a project first.");
  }

  const row = {
    user_id: userId,
    title: params.title,
    status: "todo",
    priority: params.priority || "Medium",
    effort_hours: params.effort_hours ?? null,
    due_date: params.due_date || null,
    category_id: categoryId,
  };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("id, title, status, priority, effort_hours, due_date, category_id")
    .single();
  if (error) throw error;

  // Set tags if provided
  if (params.tags && params.tags.length > 0) {
    await ensureTaskTags(userId, task.id, params.tags);
  }

  // Log creation event
  await supabase.from("task_events").insert({
    user_id: userId,
    task_id: task.id,
    event_type: "created",
    value: { source: "jarvis" },
  });

  return { created: true, task };
}

async function execUpdateTask(params, userId) {
  const updates = {};
  if (params.title !== undefined) updates.title = params.title;
  if (params.priority !== undefined) updates.priority = params.priority;
  if (params.effort_hours !== undefined) updates.effort_hours = params.effort_hours;
  if (params.due_date !== undefined) updates.due_date = params.due_date || null;
  if (params.status !== undefined) {
    updates.status = params.status;
    if (params.status === "archived") updates.archived_at = new Date().toISOString();
    if (params.status === "todo" || params.status === "doing") updates.archived_at = null;
  }
  if (params.category_id !== undefined) updates.category_id = params.category_id;

  if (Object.keys(updates).length > 0) {
    const { data: task, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", params.task_id)
      .eq("user_id", userId)
      .select("id, title, status, priority, effort_hours, due_date")
      .single();
    if (error) throw error;
    if (!task) throw new Error("Task not found.");

    await supabase.from("task_events").insert({
      user_id: userId,
      task_id: params.task_id,
      event_type: "updated",
      value: { source: "jarvis", updates },
    });
  }

  // Update tags if provided
  if (params.tags) {
    await replaceTaskTags(userId, params.task_id, params.tags);
  }

  const { data: updated, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, title, status, priority, effort_hours, due_date, tags:task_tags(tag:tags(name))")
    .eq("id", params.task_id)
    .single();
  if (fetchErr) throw fetchErr;

  return {
    updated: true,
    task: {
      ...updated,
      tags: (updated.tags || []).map((t) => t.tag?.name).filter(Boolean),
    },
  };
}

async function execCompleteTask(params, userId) {
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("id", params.task_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!task) throw new Error("Task not found.");

  // Update status to done
  await supabase
    .from("tasks")
    .update({ status: "done" })
    .eq("id", params.task_id)
    .eq("user_id", userId);

  // Log completion event
  await supabase.from("task_events").insert({
    user_id: userId,
    task_id: params.task_id,
    event_type: "completed",
    value: { source: "jarvis", date: todayStr() },
  });

  return { completed: true, task: { id: task.id, title: task.title } };
}

async function execCreateSubtasks(params, userId) {
  // Get parent task for category inheritance
  const { data: parent, error: parentErr } = await supabase
    .from("tasks")
    .select("id, title, category_id, subcategory_id, outcome_ids, primary_life_domain")
    .eq("id", params.parent_task_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (parentErr) throw parentErr;
  if (!parent) throw new Error("Parent task not found.");

  const created = [];
  for (const sub of params.subtasks) {
    const row = {
      user_id: userId,
      title: sub.title,
      status: "todo",
      priority: sub.priority || "Medium",
      effort_hours: sub.effort_hours ?? null,
      parent_task_id: params.parent_task_id,
      category_id: parent.category_id,
      subcategory_id: parent.subcategory_id,
      outcome_ids: parent.outcome_ids || [],
      primary_life_domain: parent.primary_life_domain || null,
    };

    const { data: task, error } = await supabase
      .from("tasks")
      .insert(row)
      .select("id, title, status, priority, effort_hours")
      .single();
    if (error) throw error;

    if (sub.tags && sub.tags.length > 0) {
      await ensureTaskTags(userId, task.id, sub.tags);
    }

    created.push(task);
  }

  // Log event on parent
  await supabase.from("task_events").insert({
    user_id: userId,
    task_id: params.parent_task_id,
    event_type: "updated",
    value: { source: "jarvis", action: "subtasks_created", count: created.length },
  });

  return {
    created: true,
    parent: { id: parent.id, title: parent.title },
    subtasks: created,
  };
}

async function execCreateProject(params, userId) {
  // Create category
  const { data: category, error: catErr } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: params.name })
    .select("id, name")
    .single();
  if (catErr) throw catErr;

  // Create initial tasks if provided
  const createdTasks = [];
  if (params.tasks && params.tasks.length > 0) {
    for (const t of params.tasks) {
      const row = {
        user_id: userId,
        title: t.title,
        status: "todo",
        priority: t.priority || "Medium",
        effort_hours: t.effort_hours ?? null,
        category_id: category.id,
      };
      const { data: task, error } = await supabase
        .from("tasks")
        .insert(row)
        .select("id, title, status, priority, effort_hours")
        .single();
      if (error) throw error;

      if (t.tags && t.tags.length > 0) {
        await ensureTaskTags(userId, task.id, t.tags);
      }
      createdTasks.push(task);
    }
  }

  return {
    created: true,
    project: category,
    tasks_created: createdTasks.length,
    tasks: createdTasks,
  };
}

async function execCreateIdea(params, userId) {
  const { data: idea, error } = await supabase
    .from("ideas")
    .insert({
      user_id: userId,
      title: params.title,
      details: params.details || null,
      status: "new",
    })
    .select("id, title, details, status, created_at")
    .single();
  if (error) throw error;
  return { created: true, idea };
}

async function execAddDailyNote(params, userId) {
  const date = params.date || todayStr();
  const { data, error } = await supabase
    .from("daily_notes")
    .upsert(
      { user_id: userId, date, note: params.content },
      { onConflict: "user_id,date" }
    )
    .select("id, date, note")
    .single();
  if (error) throw error;
  return { saved: true, note: data };
}

// --- Phase 3: Coaching executors ---

async function execSuggestNextActions(params, userId) {
  const count = params.count || 5;
  const mode = params.mode || "Strategic Push";

  // Fetch all open tasks with details
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, effort_hours, due_date, created_at, updated_at, parent_task_id, category_id, category:categories(name), tags:task_tags(tag:tags(name)), outcome_ids, primary_life_domain"
    )
    .eq("user_id", userId)
    .in("status", ["todo", "doing"])
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Get last completed dates for staleness scoring
  const { data: lastCompleted } = await supabase
    .from("task_events")
    .select("task_id, created_at")
    .eq("user_id", userId)
    .eq("event_type", "completed")
    .order("created_at", { ascending: false });

  const lastCompletedMap = {};
  for (const e of lastCompleted || []) {
    if (!lastCompletedMap[e.task_id]) {
      lastCompletedMap[e.task_id] = e.created_at;
    }
  }

  // Score each task (lightweight inline scorer to avoid heavy scoring.js imports)
  const priorityScores = { Critical: 50, High: 40, Medium: 30, Low: 20 };
  const scored = (tasks || []).map((task) => {
    const tagNames = (task.tags || []).map((t) => t.tag?.name).filter(Boolean);
    const isBlocked = tagNames.some((t) => ["blocked", "waiting"].includes(t.toLowerCase()));
    if (isBlocked) return null;

    const isQuickWin = tagNames.includes("quick-win") || tagNames.includes("easy-win");
    const isHighLeverage = tagNames.includes("high-leverage");
    const isUrgent = tagNames.includes("urgent");
    const hasDueDate = !!task.due_date;
    const isOverdue = hasDueDate && task.due_date < today;

    let score = priorityScores[task.priority] || 30;
    if (isQuickWin) score += 6;
    if (isHighLeverage) score += 6;
    if (isUrgent) score += 4;
    if (isOverdue) score += 10;
    if (task.parent_task_id) score += 6; // subtask boost
    if (task.effort_hours) score -= Math.min(task.effort_hours / 2, 6);

    return {
      id: task.id,
      title: task.title,
      category: task.category?.name || null,
      priority: task.priority,
      effort_hours: task.effort_hours,
      due_date: task.due_date,
      tags: tagNames,
      score: Math.round(score * 10) / 10,
      is_quick_win: isQuickWin,
      is_high_leverage: isHighLeverage,
      is_subtask: !!task.parent_task_id,
    };
  }).filter(Boolean);

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const suggestions = scored.slice(0, count);

  // Categorize top picks
  const quickWin = suggestions.find((s) => s.is_quick_win);
  const highLeverage = suggestions.find((s) => s.is_high_leverage && s !== quickWin);

  return {
    mode,
    total_eligible: scored.length,
    suggestions,
    picks: {
      quick_win: quickWin ? { id: quickWin.id, title: quickWin.title, reason: "Quick win — fast completion, builds momentum" } : null,
      high_leverage: highLeverage ? { id: highLeverage.id, title: highLeverage.title, reason: "High leverage — outsized impact for the effort" } : null,
      top_overall: suggestions[0] ? { id: suggestions[0].id, title: suggestions[0].title, score: suggestions[0].score } : null,
    },
  };
}

async function execWeeklyReviewSummary(params, userId) {
  const today = todayStr();
  const weekStart = params.week_start || getMonday(today);
  const weekEnd = getNextSunday(weekStart);

  // Completions this week
  const { data: completedEvents } = await supabase
    .from("task_events")
    .select("task_id, created_at")
    .eq("user_id", userId)
    .eq("event_type", "completed")
    .gte("created_at", `${weekStart}T00:00:00`)
    .lte("created_at", `${weekEnd}T23:59:59`);

  const completedTaskIds = [...new Set((completedEvents || []).map((e) => e.task_id))];

  // Get task details for completed tasks
  let categoryBreakdown = {};
  let domainBreakdown = {};
  let completedTitles = [];
  if (completedTaskIds.length > 0) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, category:categories(name), primary_life_domain")
      .in("id", completedTaskIds);
    for (const t of tasks || []) {
      const cat = t.category?.name || "Uncategorized";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
      if (t.primary_life_domain) {
        domainBreakdown[t.primary_life_domain] = (domainBreakdown[t.primary_life_domain] || 0) + 1;
      }
      completedTitles.push(t.title);
    }
  }

  // Completions by day
  const byDay = {};
  for (const e of completedEvents || []) {
    const day = e.created_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  // Previous week for comparison
  const prevWeekStart = getPrevMonday(weekStart);
  const { count: prevWeekCount } = await supabase
    .from("task_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "completed")
    .gte("created_at", `${prevWeekStart}T00:00:00`)
    .lte("created_at", `${weekStart}T00:00:00`);

  // Overdue tasks
  const { data: overdueTasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, category:categories(name)")
    .eq("user_id", userId)
    .in("status", ["todo", "doing"])
    .lt("due_date", today)
    .order("due_date")
    .limit(10);

  // Stale "doing" tasks
  const threeDaysAgo = new Date(new Date(today).getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const { data: staleTasks } = await supabase
    .from("tasks")
    .select("id, title, updated_at, category:categories(name)")
    .eq("user_id", userId)
    .eq("status", "doing")
    .lt("updated_at", `${threeDaysAgo}T00:00:00`)
    .limit(10);

  // Total open tasks
  const { count: openCount } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["todo", "doing"]);

  // Categories with no completions this week
  const { data: allCategories } = await supabase
    .from("categories")
    .select("name")
    .eq("user_id", userId);
  const neglectedCategories = (allCategories || [])
    .map((c) => c.name)
    .filter((name) => !categoryBreakdown[name]);

  return {
    week_start: weekStart,
    week_end: weekEnd,
    completions: {
      total: completedEvents?.length || 0,
      unique_tasks: completedTaskIds.length,
      by_day: byDay,
      by_category: categoryBreakdown,
      by_domain: domainBreakdown,
      titles: completedTitles.slice(0, 20),
    },
    comparison: {
      prev_week_total: prevWeekCount || 0,
      change: (completedEvents?.length || 0) - (prevWeekCount || 0),
    },
    attention: {
      overdue: (overdueTasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        category: t.category?.name,
      })),
      stale_doing: (staleTasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        last_updated: t.updated_at,
        category: t.category?.name,
      })),
      neglected_categories: neglectedCategories,
    },
    backlog_size: openCount || 0,
  };
}

async function execCheckNudges(_params, userId) {
  return await detectNudges(userId);
}

// --- Project management executors ---

async function execGetProjectDetails(params, userId) {
  const catId = params.category_id;

  // Get category
  const { data: category, error: catErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (catErr) throw catErr;
  if (!category) throw new Error("Project not found.");

  // Get workspace + knowledge base
  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("workspace, knowledge_base, legacy_links")
    .eq("category_id", catId)
    .maybeSingle();

  // Get all tasks in this project
  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, effort_hours, due_date, parent_task_id, created_at, updated_at, outcome_ids, primary_life_domain, tags:task_tags(tag:tags(name))"
    )
    .eq("user_id", userId)
    .eq("category_id", catId)
    .order("created_at");
  if (taskErr) throw taskErr;

  const rootTasks = [];
  const subtasksByParent = {};
  for (const t of tasks || []) {
    const formatted = {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      effort_hours: t.effort_hours,
      due_date: t.due_date,
      outcome_ids: t.outcome_ids,
      primary_life_domain: t.primary_life_domain,
      tags: (t.tags || []).map((tg) => tg.tag?.name).filter(Boolean),
    };
    if (t.parent_task_id) {
      if (!subtasksByParent[t.parent_task_id]) subtasksByParent[t.parent_task_id] = [];
      subtasksByParent[t.parent_task_id].push(formatted);
    } else {
      rootTasks.push(formatted);
    }
  }

  // Attach subtasks to root tasks
  for (const root of rootTasks) {
    root.subtasks = subtasksByParent[root.id] || [];
  }

  const workspace = ws?.workspace || {};
  const resources = workspace.resources || [];

  // Compute progress
  const totalRoot = rootTasks.length;
  const doneRoot = rootTasks.filter((t) => t.status === "done" || t.status === "archived").length;
  const overdueRoot = rootTasks.filter(
    (t) => t.due_date && t.due_date < todayStr() && t.status !== "done" && t.status !== "archived"
  ).length;

  return {
    project: {
      id: category.id,
      name: category.name,
      mantra: workspace.mantra || "",
      narrative: workspace.narrative || "",
    },
    knowledge_base: ws?.knowledge_base || "",
    resources: resources.map((r) => ({
      label: r.label,
      url: r.url,
      kind: r.kind,
      status: r.status || "reference",
      notes: r.notes || "",
    })),
    progress: {
      total_root_tasks: totalRoot,
      done: doneRoot,
      overdue: overdueRoot,
      open: totalRoot - doneRoot,
    },
    tasks: rootTasks,
  };
}

async function execUpdateProject(params, userId) {
  const catId = params.category_id;

  // Verify ownership
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  // Get current workspace
  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("workspace")
    .eq("category_id", catId)
    .maybeSingle();

  const currentWorkspace = ws?.workspace || {};
  const updates = { ...currentWorkspace };
  if (params.mantra !== undefined) updates.mantra = params.mantra;
  if (params.narrative !== undefined) updates.narrative = params.narrative;

  const { error } = await supabase
    .from("shared_project_workspaces")
    .upsert(
      { category_id: catId, owner_user_id: userId, workspace: updates, updated_at: new Date().toISOString() },
      { onConflict: "category_id" }
    );
  if (error) throw error;

  return { updated: true, mantra: updates.mantra || "", narrative: updates.narrative || "" };
}

async function execGetProjectKnowledge(params, userId) {
  const catId = params.category_id;

  const { data: category } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("knowledge_base, workspace")
    .eq("category_id", catId)
    .maybeSingle();

  const resources = (ws?.workspace?.resources || []).map((r) => ({
    label: r.label,
    url: r.url,
    kind: r.kind,
    status: r.status || "reference",
    notes: r.notes || "",
  }));

  return {
    project_name: category.name,
    knowledge_base: ws?.knowledge_base || "",
    resources,
  };
}

async function execUpdateProjectKnowledge(params, userId) {
  const catId = params.category_id;
  const mode = params.mode || "append";

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("knowledge_base")
    .eq("category_id", catId)
    .maybeSingle();

  const current = ws?.knowledge_base || "";
  const newContent = mode === "replace"
    ? params.content
    : current
      ? `${current}\n\n${params.content}`
      : params.content;

  const { error } = await supabase
    .from("shared_project_workspaces")
    .upsert(
      { category_id: catId, owner_user_id: userId, knowledge_base: newContent, updated_at: new Date().toISOString() },
      { onConflict: "category_id" }
    );
  if (error) throw error;

  return { updated: true, knowledge_base_length: newContent.length };
}

async function execAddProjectResource(params, userId) {
  const catId = params.category_id;

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("workspace")
    .eq("category_id", catId)
    .maybeSingle();

  const currentWorkspace = ws?.workspace || {};
  const resources = Array.isArray(currentWorkspace.resources) ? [...currentWorkspace.resources] : [];

  resources.push({
    id: `r_${Date.now()}`,
    label: params.label,
    url: params.url || "",
    kind: params.kind || "link",
    status: params.status || "active",
    notes: params.notes || "",
  });

  const { error } = await supabase
    .from("shared_project_workspaces")
    .upsert(
      { category_id: catId, owner_user_id: userId, workspace: { ...currentWorkspace, resources }, updated_at: new Date().toISOString() },
      { onConflict: "category_id" }
    );
  if (error) throw error;

  return { added: true, resource: resources[resources.length - 1], total_resources: resources.length };
}

async function execGetRecentImportSummary(params, userId) {
  const catId = params.category_id;

  const { data: category } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  const { data: imports, error } = await supabase
    .from("external_ai_import_runs")
    .select("id, status, source_model, preview_metrics, created_at, accepted_action_ids, applied_action_ids")
    .eq("user_id", userId)
    .eq("category_id", catId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  if (!imports || imports.length === 0) {
    return { project_name: category.name, imports: [], message: "No external AI imports found for this project." };
  }

  return {
    project_name: category.name,
    imports: imports.map((imp) => ({
      id: imp.id,
      status: imp.status,
      source_model: imp.source_model,
      created_at: imp.created_at,
      accepted_count: imp.accepted_action_ids?.length || 0,
      applied_count: imp.applied_action_ids?.length || 0,
      metrics: imp.preview_metrics || {},
    })),
  };
}

function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function getNextSunday(mondayStr) {
  const d = new Date(mondayStr);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function getPrevMonday(mondayStr) {
  const d = new Date(mondayStr);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// --- Tag helpers ---

async function ensureTagId(userId, tagName) {
  const name = tagName.toLowerCase().trim();
  const { data: existing } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("tags")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function ensureTaskTags(userId, taskId, tagNames) {
  for (const name of tagNames) {
    const tagId = await ensureTagId(userId, name);
    const { data: existing } = await supabase
      .from("task_tags")
      .select("id")
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .eq("tag_id", tagId)
      .maybeSingle();
    if (!existing) {
      await supabase.from("task_tags").insert({
        user_id: userId,
        task_id: taskId,
        tag_id: tagId,
      });
    }
  }
}

async function replaceTaskTags(userId, taskId, tagNames) {
  // Remove existing tags
  await supabase
    .from("task_tags")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId);

  // Add new tags
  if (tagNames.length > 0) {
    await ensureTaskTags(userId, taskId, tagNames);
  }
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
  // Phase 2 write tools
  create_task: execCreateTask,
  update_task: execUpdateTask,
  complete_task: execCompleteTask,
  create_subtasks: execCreateSubtasks,
  create_project: execCreateProject,
  create_idea: execCreateIdea,
  add_daily_note: execAddDailyNote,
  // Phase 3 coaching tools
  suggest_next_actions: execSuggestNextActions,
  weekly_review_summary: execWeeklyReviewSummary,
  check_nudges: execCheckNudges,
  // Project management tools
  get_project_details: execGetProjectDetails,
  update_project: execUpdateProject,
  get_project_knowledge: execGetProjectKnowledge,
  update_project_knowledge: execUpdateProjectKnowledge,
  add_project_resource: execAddProjectResource,
  get_recent_import_summary: execGetRecentImportSummary,
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
