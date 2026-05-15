// Jarvis tool definitions and executors
// Each tool wraps existing DB queries using the service-role supabase client
// Phase 1: read-only tools | Phase 2: write tools

import { createClient } from "@supabase/supabase-js";
import { TIMEZONE } from "./scoring.js";
import { detectNudges } from "./jarvis-nudges.js";
import { autoRefillAfterCompletion } from "./projectNextAction.js";
import {
  writeMemory,
  searchMemories,
  updateMemory,
  deleteMemory,
  archive as archiveMemory,
} from "./memories.js";
import { applyProjectReorient } from "./reorientFlow.js";
import {
  addPart,
  updatePart,
  getPart,
  listParts,
  searchParts as searchPartsLib,
  markInstalled,
  linkPartToTask,
} from "./projectParts.js";
import {
  addIscToOutcome,
  setIscMet,
  removeIsc as removeIscPure,
  outcomesProgress,
} from "./iscProgress.js";

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
      "Create a new task in the user's backlog. Use this when the user describes something they need to do, or when breaking down a situation into actionable items. Always look up categories first to assign the right one. ALWAYS set `phase` when creating tasks during a reorient pass or daily-context dump — unphased tasks pile up as 'Unphased' in the project task ladder.\n\nIMPORTANT (working-style trait — see persona block): If the user has the 'logistics-first' trait AND the task involves physical parts/materials/tools, propose a gather/locate/organize PRECURSOR task FIRST before the doing-task. Use action verbs in the title (GATHER:, FIND:, ORGANIZE:) and tag as 'quick-win'. Effort should be 15-60 minutes. Examples: 'GATHER: Move all batteries to bench with outlet + WiFi', 'FIND: Locate the multimeter + bring to workbench', 'ORGANIZE: Inventory cable spools, label by gauge'. This is not busywork — for users with this trait it's what unlocks momentum.",
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
          description: "Tags like quick-win, high-leverage, urgent, deep, physical, low-energy. When the task is spawned from the user's daily context dump, ALSO include a provenance tag of the form 'ctx:YYYY-MM-DD' (today's date) so the weekly review can trace it back to the day it came from.",
        },
        phase: {
          type: "string",
          enum: ["immediate", "this_week", "next_2w", "next_30d", "ongoing", "blocked", "someday"],
          description: "Time-window bucket (locked taxonomy). ALWAYS set during a reorient or daily-context dump; otherwise the task lands in 'Unphased' and clutters the project task ladder. immediate = today / next 24h; this_week = within 7 days; next_2w = 8-14 days out; next_30d = this month; ongoing = recurring / maintenance; blocked = waiting on something external; someday = parked. For multi-task batches with mixed phases, prefer bulk_triage_tasks.",
        },
        notes: {
          type: "string",
          description: "Free-text markdown notes / rich procedural content for this task. Use for embedded step-by-step instructions, URLs, reference info that should live on the task itself (logistics-first preference: info at the workbench, not buried in conversation scrollback). Markdown supported. Empty string allowed.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update an existing task's properties. Use get_task_details or get_backlog first to find the task_id. Use `phase` to move a task between time-window buckets (immediate / this_week / next_2w / next_30d / ongoing / blocked / someday); pass null to clear phase. Use `notes` to set/replace the task's markdown notes body; pass null to clear.",
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
        phase: {
          type: ["string", "null"],
          enum: ["immediate", "this_week", "next_2w", "next_30d", "ongoing", "blocked", "someday", null],
          description: "Time-window bucket. Move the task between phases or pass null to clear. immediate = today; this_week = 7 days; next_2w = 8-14 days; next_30d = this month; ongoing = recurring; blocked = external wait; someday = parked.",
        },
        notes: {
          type: ["string", "null"],
          description: "Markdown notes body for this task. Pass a string to set/replace; pass null to clear.",
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
      "Create multiple subtasks under a parent task. Use this to break down a large task into smaller next actions.\n\nIMPORTANT (working-style trait — see persona block): If the user has the 'logistics-first' trait AND the parent task involves physical work, the FIRST subtask should be a gather/locate/organize precursor (GATHER:/FIND:/ORGANIZE: prefix, 15-60 min, tagged 'quick-win'). Subsequent subtasks can be the doing-work in order. Skip the precursor only if the parent task title already starts with one of those verbs.",
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
      "Update a project's strategic brief — rename it, set its mantra (one-liner), and/or set its narrative (long-form strategy document). Pass any subset.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        name: {
          type: "string",
          description: "New project/category name. Use to rename a project (e.g., from 'Mom and Dad' to 'Parents'). Must be non-empty after trimming.",
        },
        mantra: { type: "string", description: "One-line project intent." },
        narrative: { type: "string", description: "Long-form strategic narrative." },
      },
      required: ["category_id"],
    },
  },
  {
    name: "update_project_workspace",
    description:
      "Write to a project's workspace — the alignment timestamp, the 'Next best 30-minute action' block, outcomes, life domains, or mantra. Use at the end of a Project Refresh interview to stamp last_aligned_at and commit the next_action. Also used by auto-refill after task completions and by morning approvals.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        last_aligned_at: {
          type: "string",
          description: "ISO timestamp, or the string 'now' (executor will substitute). Set at the end of a refresh interview.",
        },
        next_action: {
          type: "object",
          description: "The next ≤30m action for this project.",
          properties: {
            title: { type: "string", description: "Verb-first action title." },
            minutes: { type: "number", description: "Estimated minutes; ≤30 preferred." },
            why: { type: "string", description: "One-liner on why this is the leverage point." },
            task_id: { type: "string", description: "UUID of the backing task (if it exists). Create the task first if needed." },
            source: { type: "string", enum: ["interview", "auto_refill", "morning_approvals"] },
            needs_breakdown: { type: "boolean", description: "Set true when the task is > 30m and could not be auto-broken. Morning Approvals will propose a breakdown." },
          },
        },
        outcome_ids: { type: "array", items: { type: "string" } },
        life_domains: { type: "array", items: { type: "string" } },
        primary_life_domain: { type: "string" },
        mantra: { type: "string" },
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
    name: "save_session_summary",
    description:
      "Save a summary of the current conversation session. Call this when the conversation reaches a natural conclusion (user says thanks, goodbye, that's all, etc.) or when you've completed a significant planning/task creation session. Include what was discussed, decisions made, and tasks created/completed.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence summary of the session — what was discussed, decided, and done." },
        topics: {
          type: "array",
          items: { type: "string" },
          description: "Topic tags (e.g., 'boat project', 'weekly review', 'task creation').",
        },
        tasks_created: { type: "number", description: "Number of tasks created in this session." },
        tasks_completed: { type: "number", description: "Number of tasks completed in this session." },
      },
      required: ["summary"],
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

  // --- Ordering & dependency tools ---

  {
    name: "reorder_project_tasks",
    description:
      "Set the root task order for a project. This overwrites the current manual order. Use after analyzing a project plan and getting user approval to apply a new sequence. The same storage is used by drag-and-drop, so this overrides any previous manual ordering.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        task_ids: {
          type: "array",
          items: { type: "string" },
          description: "Ordered array of task UUIDs, from highest to lowest priority.",
        },
      },
      required: ["category_id", "task_ids"],
    },
  },
  {
    name: "reorder_subtasks",
    description:
      "Set the subtask order within a parent task. Overwrites previous subtask ordering for that parent.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
        parent_task_id: { type: "string", description: "UUID of the parent task." },
        subtask_ids: {
          type: "array",
          items: { type: "string" },
          description: "Ordered array of subtask UUIDs.",
        },
      },
      required: ["category_id", "parent_task_id", "subtask_ids"],
    },
  },
  {
    name: "set_task_dependency",
    description:
      "Mark a task as blocked by another task, or clear its dependencies. Blocked tasks are skipped when selecting next actions for the Today page and shown as blocked in the UI.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task to set dependency on." },
        blocked_by_task_id: { type: "string", description: "UUID of the task that blocks this one. Omit to clear." },
        clear: { type: "boolean", description: "Set to true to clear all dependencies on this task." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "analyze_project_plan",
    description:
      "Analyze a project's tasks, current order, dependencies, and knowledge base to recommend a prioritized sequence. Returns all task details with current ordering so you can suggest improvements. Always explain your reasoning for each position. The user reviews your suggestion before you apply it with reorder_project_tasks.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project/category." },
      },
      required: ["category_id"],
    },
  },
  {
    name: "write_memory",
    description:
      "Write a durable, atomic fact to the user's warm-tier memory store. Use this when you notice a stable, useful fact emerge in conversation — a relationship (who is X), a constraint (Y blocks Z), a decision (we chose A because B), a preference (the user likes mornings for deep work). DO NOT use this to remember transient state (today's queue, this hour's mood). DO NOT restate a task the user already wrote down. Each memory should be one self-contained sentence. Scope it tightly: project/task/outcome/person when applicable; global only for cross-system facts.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "One self-contained sentence capturing the fact.",
        },
        scope_type: {
          type: "string",
          enum: ["global", "outcome", "project", "task", "person"],
          description: "What this memory is scoped to.",
        },
        scope_id: {
          type: "string",
          description:
            "ID matching the scope_type: outcome_id (e.g., 'vision-3'), category_id, task_id, or name/email. Omit for global.",
        },
        kind: {
          type: "string",
          enum: [
            "fact",
            "decision",
            "preference",
            "relationship",
            "constraint",
            "observation",
            "commitment",
          ],
          description: "The flavor of memory this is.",
        },
        importance: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "How important this is for future planning. Default 6.",
        },
      },
      required: ["content", "scope_type", "kind"],
    },
  },
  {
    name: "search_memories",
    description:
      "Search the user's warm-tier memory store for relevant durable facts. The system prompt already injects the top results scoped to the current conversation, so use this tool only when you need to look up something specific (e.g., 'who is the BMS contact?', 'what was the decision on the home solar carport?'). Returns memories ranked by semantic similarity.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language query to embed and search by." },
        scope_type: {
          type: "string",
          enum: ["global", "outcome", "project", "task", "person"],
          description: "Optional scope filter.",
        },
        scope_id: { type: "string", description: "Optional scope id filter (requires scope_type)." },
        top_k: { type: "integer", minimum: 1, maximum: 20, description: "Max results (default 5)." },
      },
      required: ["query"],
    },
  },
  {
    name: "update_memory",
    description:
      "Edit an existing memory. Use to fix typos, sharpen a fact, change importance, or re-scope. If you change `content`, the embedding is regenerated automatically so semantic search stays accurate. Prefer this over writing a corrective NEW memory — corrective writes cause duplicate clutter that's expensive to consolidate later.",
    input_schema: {
      type: "object",
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to edit." },
        content: { type: "string", description: "New one-sentence content. If changed, embedding is regenerated automatically." },
        kind: {
          type: "string",
          enum: ["fact","decision","preference","relationship","constraint","observation","commitment"],
          description: "Change the kind classification.",
        },
        importance: { type: "integer", minimum: 1, maximum: 10, description: "New importance 1-10." },
        scope_type: {
          type: "string",
          enum: ["global","outcome","project","task","person"],
          description: "Move to a different scope type.",
        },
        scope_id: { type: "string", description: "New scope id (empty string = clear / global)." },
      },
      required: ["memory_id"],
    },
  },
  {
    name: "delete_memory",
    description:
      "Remove a memory from the warm-tier store. Use this to clean up clearly-wrong or duplicate memories. By default this is a SOFT archive (sets archived_at, keeps the row so it can still be inspected via cold-archive tooling). Pass hard=true to permanently delete the row — use sparingly; archive is usually safer.",
    input_schema: {
      type: "object",
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to remove." },
        hard: { type: "boolean", description: "If true, hard-delete the row (default false = soft archive)." },
      },
      required: ["memory_id"],
    },
  },
  {
    name: "add_isc",
    description:
      "Add an Ideal State Criterion to one of the user's desired outcomes. ISCs are concrete verification items — 'U-BMS programmed and bench-tested,' 'mortgage closed,' etc. — that let progress toward an outcome be measured honestly. Use when the user names a verification item explicitly, or when proposing one during a Reorient pass that the user has agreed to add. Don't fabricate ISCs without user buy-in.",
    input_schema: {
      type: "object",
      properties: {
        outcome_id: {
          type: "string",
          description: "Outcome id, e.g. 'vision-3'. Use get_profile to look these up.",
        },
        statement: {
          type: "string",
          description: "One concrete, verifiable sentence.",
        },
      },
      required: ["outcome_id", "statement"],
    },
  },
  {
    name: "set_isc_met",
    description:
      "Toggle whether an existing Ideal State Criterion is met. Use when the user says they've finished a verification item. The agent should never silently flip ISCs based on inferred task completion — wait for the user to confirm.",
    input_schema: {
      type: "object",
      properties: {
        outcome_id: { type: "string" },
        isc_id: { type: "string" },
        met: { type: "boolean" },
      },
      required: ["outcome_id", "isc_id", "met"],
    },
  },
  {
    name: "remove_isc",
    description:
      "Remove an Ideal State Criterion from an outcome. Use only when the user explicitly says a criterion is no longer relevant.",
    input_schema: {
      type: "object",
      properties: {
        outcome_id: { type: "string" },
        isc_id: { type: "string" },
      },
      required: ["outcome_id", "isc_id"],
    },
  },
  {
    name: "bulk_triage_tasks",
    description:
      "Apply a batch of task decisions for one project — mark some done, archive others, assign phase buckets to the rest. Used during the Reorient flow OR when the user describes a batch of updates in conversation ('finished tasks 1, 4, and 7; archive #12; everything else is next 2 weeks'). One round-trip writes all decisions and stamps the project's last_reorient_at. ONLY call this when the user has explicitly enumerated which tasks fall into which bucket — don't guess on their behalf.",
    input_schema: {
      type: "object",
      properties: {
        category_id: {
          type: "string",
          description: "UUID of the project/category these decisions belong to.",
        },
        decisions: {
          type: "array",
          description: "One decision per task. action='done' completes, 'archive' removes, 'keep' updates phase.",
          items: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              action: { type: "string", enum: ["done", "archive", "keep"] },
              phase: {
                type: "string",
                enum: ["immediate", "this_week", "next_2w", "next_30d", "ongoing", "blocked", "someday"],
                description: "Required when action='keep'.",
              },
            },
            required: ["task_id", "action"],
          },
        },
      },
      required: ["category_id", "decisions"],
    },
  },
  // --- Parts Inventory tools ---
  {
    name: "add_part",
    description:
      "Add a physical part to a project's hardware inventory. Use when the user describes hardware they have on hand, in a photo they share, or have just ordered. Capture as much spec as you can extract (model, voltage, capacity, wattage, etc.) into the spec object. Set status to on_hand (default), ordered (just bought, not arrived), planned (intend to buy), or installed (already on the boat/site). Location uses the @home / @longterm / @workyard / @boat vocab. Workstream uses EL/CH/HU/SY/SR/CO/LR/AI. Source_ref should point at the note or memory the part was extracted from when available.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string", description: "UUID of the project this part belongs to." },
        name: { type: "string", description: "Human-readable name, e.g. 'Valence U27-12XP'." },
        part_number: { type: "string", description: "Manufacturer part number if known." },
        manufacturer: { type: "string", description: "Manufacturer / brand." },
        qty: { type: "integer", minimum: 0, description: "Quantity on hand. Default 1." },
        status: {
          type: "string",
          enum: ["on_hand", "installed", "ordered", "planned", "missing", "retired"],
          description: "Lifecycle status. Default on_hand.",
        },
        location: { type: "string", description: "@home | @longterm | @workyard | @boat (free string)." },
        workstream: { type: "string", description: "EL | CH | HU | SY | SR | CO | LR | AI (free string)." },
        spec: {
          type: "object",
          description: "Flexible structured spec (voltage, capacity_ah, wattage_w, fuse_a, dimensions, chemistry, etc.).",
        },
        notes: { type: "string", description: "Free-text observations, condition, install hints." },
        source_ref: { type: "string", description: "note:<uuid> or memory:<uuid> pointer for provenance." },
      },
      required: ["category_id", "name"],
    },
  },
  {
    name: "update_part",
    description:
      "Update fields on an existing part. Use to correct a spec, change status, move location, or add notes. Only the fields you pass are changed.",
    input_schema: {
      type: "object",
      properties: {
        part_id: { type: "string" },
        name: { type: "string" },
        part_number: { type: "string" },
        manufacturer: { type: "string" },
        qty: { type: "integer", minimum: 0 },
        status: {
          type: "string",
          enum: ["on_hand", "installed", "ordered", "planned", "missing", "retired"],
        },
        location: { type: "string" },
        workstream: { type: "string" },
        spec: { type: "object" },
        notes: { type: "string" },
      },
      required: ["part_id"],
    },
  },
  {
    name: "search_parts",
    description:
      "List or search the user's parts inventory. Filter by category_id (project), status, workstream, location, or a free-text query (matched against name, notes, part_number, manufacturer). Returns up to `limit` rows ordered by most recently added.",
    input_schema: {
      type: "object",
      properties: {
        category_id: { type: "string" },
        status: {
          type: "string",
          enum: ["on_hand", "installed", "ordered", "planned", "missing", "retired"],
        },
        workstream: { type: "string" },
        location: { type: "string" },
        query: { type: "string", description: "Free-text search." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50." },
      },
    },
  },
  {
    name: "mark_part_installed",
    description:
      "Convenience flip: set a part's status to 'installed' and stamp installed_at. Use when the user reports a part has been physically installed on the boat / site.",
    input_schema: {
      type: "object",
      properties: {
        part_id: { type: "string" },
        installed_at: { type: "string", description: "ISO timestamp; defaults to now." },
      },
      required: ["part_id"],
    },
  },
  {
    name: "link_part_to_task",
    description:
      "Link a part to a task so completing the task can carry semantic weight. Use roles: 'installs' (task installs this part), 'consumes' (task uses up this part), 'configures' (task programs/sets up this part), 'references' (task otherwise depends on this part).",
    input_schema: {
      type: "object",
      properties: {
        part_id: { type: "string" },
        task_id: { type: "string" },
        role: {
          type: "string",
          enum: ["installs", "consumes", "configures", "references"],
          description: "Default 'installs'.",
        },
      },
      required: ["part_id", "task_id"],
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
    phase: params.phase ?? null,
    notes: params.notes ?? null,
  };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("id, title, status, priority, effort_hours, due_date, category_id, phase, notes")
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
  if (params.phase !== undefined) updates.phase = params.phase;
  if (params.notes !== undefined) updates.notes = params.notes;

  if (Object.keys(updates).length > 0) {
    const { data: task, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", params.task_id)
      .eq("user_id", userId)
      .select("id, title, status, priority, effort_hours, due_date, phase, notes")
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
    .select("id, title, status, priority, effort_hours, due_date, phase, notes, tags:task_tags(tag:tags(name))")
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

  // Auto-refill the project's next_action if this task was it.
  await autoRefillAfterCompletion(userId, params.task_id);

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

  // Verify ownership + grab current name
  const { data: category } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  // Rename the category if requested
  let updatedName = category.name;
  if (params.name !== undefined) {
    const trimmedName = String(params.name).trim();
    if (!trimmedName) throw new Error("name must be a non-empty string.");
    const { data: renamed, error: renameErr } = await supabase
      .from("categories")
      .update({ name: trimmedName })
      .eq("id", catId)
      .eq("user_id", userId)
      .select("name")
      .single();
    if (renameErr) throw renameErr;
    updatedName = renamed?.name ?? trimmedName;
  }

  // Update workspace (mantra/narrative) if either was provided
  const hasWorkspaceChanges =
    params.mantra !== undefined || params.narrative !== undefined;

  let mantra = "";
  let narrative = "";
  if (hasWorkspaceChanges) {
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
    mantra = updates.mantra || "";
    narrative = updates.narrative || "";
  } else {
    // Read current workspace so the return payload reflects unchanged values
    const { data: ws } = await supabase
      .from("shared_project_workspaces")
      .select("workspace")
      .eq("category_id", catId)
      .maybeSingle();
    const currentWorkspace = ws?.workspace || {};
    mantra = currentWorkspace.mantra || "";
    narrative = currentWorkspace.narrative || "";
  }

  return { updated: true, name: updatedName, mantra, narrative };
}

async function execUpdateProjectWorkspace(params, userId) {
  const catId = params.category_id;
  if (!catId) throw new Error("category_id is required.");

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("workspace, legacy_links, knowledge_base, task_order_ids, subtask_order_ids")
    .eq("category_id", catId)
    .maybeSingle();

  const currentWorkspace = ws?.workspace && typeof ws.workspace === "object" ? ws.workspace : {};
  const updates = { ...currentWorkspace };

  if (params.mantra !== undefined) updates.mantra = String(params.mantra || "");
  if (Array.isArray(params.outcome_ids)) {
    updates.outcome_ids = params.outcome_ids.map((v) => String(v)).filter(Boolean);
  }
  if (Array.isArray(params.life_domains)) {
    updates.life_domains = params.life_domains.map((v) => String(v)).filter(Boolean).slice(0, 3);
  }
  if (params.primary_life_domain !== undefined) {
    updates.primary_life_domain = params.primary_life_domain || null;
  }
  if (params.last_aligned_at !== undefined) {
    updates.last_aligned_at =
      params.last_aligned_at === "now" ? new Date().toISOString() : params.last_aligned_at || null;
  }
  if (params.next_action !== undefined) {
    const na = params.next_action;
    if (na === null) {
      updates.next_action = null;
    } else if (na && typeof na === "object") {
      updates.next_action = {
        title: String(na.title || ""),
        minutes: Number(na.minutes) || null,
        why: String(na.why || ""),
        task_id: na.task_id || null,
        set_at: new Date().toISOString(),
        source: na.source || "interview",
        needs_breakdown: !!na.needs_breakdown,
      };
    }
  }

  const { error } = await supabase
    .from("shared_project_workspaces")
    .upsert(
      {
        category_id: catId,
        owner_user_id: userId,
        workspace: updates,
        legacy_links: ws?.legacy_links || "",
        knowledge_base: ws?.knowledge_base || "",
        task_order_ids: ws?.task_order_ids || [],
        subtask_order_ids: ws?.subtask_order_ids || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category_id" }
    );
  if (error) throw error;

  return {
    updated: true,
    last_aligned_at: updates.last_aligned_at || null,
    next_action: updates.next_action || null,
  };
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

async function execSaveSessionSummary(params, userId) {
  const { data, error } = await supabase
    .from("jarvis_session_summaries")
    .insert({
      user_id: userId,
      summary: params.summary,
      topics: params.topics || [],
      tasks_created: params.tasks_created || 0,
      tasks_completed: params.tasks_completed || 0,
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return { saved: true, id: data.id, created_at: data.created_at };
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

// --- Ordering & dependency executors ---

async function execReorderProjectTasks(params, userId) {
  const catId = params.category_id;
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  const taskIds = (params.task_ids || []).map(String).filter(Boolean);
  const { error } = await supabase
    .from("shared_project_workspaces")
    .upsert(
      { category_id: catId, owner_user_id: userId, task_order_ids: taskIds, updated_at: new Date().toISOString() },
      { onConflict: "category_id" }
    );
  if (error) throw error;
  return { reordered: true, task_count: taskIds.length };
}

async function execReorderSubtasks(params, userId) {
  const catId = params.category_id;
  const parentId = params.parent_task_id;
  const subtaskIds = (params.subtask_ids || []).map(String).filter(Boolean);

  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("subtask_order_ids")
    .eq("category_id", catId)
    .maybeSingle();

  const current = ws?.subtask_order_ids || {};
  current[parentId] = subtaskIds;

  const { error } = await supabase
    .from("shared_project_workspaces")
    .upsert(
      { category_id: catId, owner_user_id: userId, subtask_order_ids: current, updated_at: new Date().toISOString() },
      { onConflict: "category_id" }
    );
  if (error) throw error;
  return { reordered: true, parent_task_id: parentId, subtask_count: subtaskIds.length };
}

async function execSetTaskDependency(params, userId) {
  const taskId = params.task_id;

  if (params.clear) {
    // Remove all blocked-by tags
    const { data: tagLinks } = await supabase
      .from("task_tags")
      .select("id, tag:tags(name)")
      .eq("task_id", taskId)
      .eq("user_id", userId);

    const blockedTagIds = (tagLinks || [])
      .filter((tl) => tl.tag?.name?.startsWith("blocked-by:"))
      .map((tl) => tl.id);

    if (blockedTagIds.length > 0) {
      await supabase.from("task_tags").delete().in("id", blockedTagIds);
    }
    return { updated: true, task_id: taskId, cleared: true };
  }

  if (params.blocked_by_task_id) {
    const tagName = `blocked-by:${params.blocked_by_task_id}`;
    // Ensure tag exists
    let { data: tag } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", tagName)
      .maybeSingle();

    if (!tag) {
      const { data: created } = await supabase
        .from("tags")
        .insert({ user_id: userId, name: tagName })
        .select("id")
        .single();
      tag = created;
    }

    // Check if already linked
    const { data: existing } = await supabase
      .from("task_tags")
      .select("id")
      .eq("task_id", taskId)
      .eq("tag_id", tag.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from("task_tags").insert({ user_id: userId, task_id: taskId, tag_id: tag.id });
    }

    return { updated: true, task_id: taskId, blocked_by: params.blocked_by_task_id };
  }

  return { error: "Provide blocked_by_task_id or set clear: true" };
}

async function execAnalyzeProjectPlan(params, userId) {
  const catId = params.category_id;

  // Get category
  const { data: category } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", catId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) throw new Error("Project not found.");

  // Get workspace (order + KB)
  const { data: ws } = await supabase
    .from("shared_project_workspaces")
    .select("workspace, knowledge_base, task_order_ids, subtask_order_ids")
    .eq("category_id", catId)
    .maybeSingle();

  // Get all tasks
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, effort_hours, due_date, phase, notes, parent_task_id, tags:task_tags(tag:tags(name)), outcome_ids, primary_life_domain, created_at")
    .eq("user_id", userId)
    .eq("category_id", catId)
    .order("created_at");

  const orderIds = Array.isArray(ws?.task_order_ids) ? ws.task_order_ids : [];
  const subtaskOrderIds = ws?.subtask_order_ids || {};

  const rootTasks = [];
  const subtasksByParent = {};
  for (const t of tasks || []) {
    const tags = (t.tags || []).map((tg) => tg.tag?.name).filter(Boolean);
    const dependencies = tags.filter((tag) => tag.startsWith("blocked-by:")).map((tag) => tag.replace("blocked-by:", ""));
    const formatted = {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      effort_hours: t.effort_hours,
      due_date: t.due_date,
      tags,
      dependencies,
      outcome_ids: t.outcome_ids,
      primary_life_domain: t.primary_life_domain,
    };
    if (t.parent_task_id) {
      if (!subtasksByParent[t.parent_task_id]) subtasksByParent[t.parent_task_id] = [];
      subtasksByParent[t.parent_task_id].push(formatted);
    } else {
      rootTasks.push(formatted);
    }
  }

  // Apply current order
  const byId = new Map(rootTasks.map((t) => [t.id, t]));
  const inOrder = orderIds.map((id) => byId.get(id)).filter(Boolean);
  const remaining = rootTasks.filter((t) => !orderIds.includes(t.id));
  const orderedRoots = [...inOrder, ...remaining];

  // Attach subtasks
  for (const root of orderedRoots) {
    const subs = subtasksByParent[root.id] || [];
    const subOrder = subtaskOrderIds[root.id] || [];
    if (subOrder.length > 0) {
      const subById = new Map(subs.map((s) => [s.id, s]));
      const ordered = subOrder.map((id) => subById.get(id)).filter(Boolean);
      const rest = subs.filter((s) => !subOrder.includes(s.id));
      root.subtasks = [...ordered, ...rest];
    } else {
      root.subtasks = subs;
    }
  }

  return {
    project: {
      name: category.name,
      mantra: ws?.workspace?.mantra || "",
    },
    knowledge_base_summary: (ws?.knowledge_base || "").slice(0, 500) || "(empty)",
    current_order: orderedRoots.map((t, i) => ({
      position: i + 1,
      ...t,
    })),
    total_root_tasks: orderedRoots.length,
    open_tasks: orderedRoots.filter((t) => t.status !== "done" && t.status !== "archived").length,
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
  update_project_workspace: execUpdateProjectWorkspace,
  get_project_knowledge: execGetProjectKnowledge,
  update_project_knowledge: execUpdateProjectKnowledge,
  add_project_resource: execAddProjectResource,
  get_recent_import_summary: execGetRecentImportSummary,
  save_session_summary: execSaveSessionSummary,
  // Ordering & dependency tools
  reorder_project_tasks: execReorderProjectTasks,
  reorder_subtasks: execReorderSubtasks,
  set_task_dependency: execSetTaskDependency,
  analyze_project_plan: execAnalyzeProjectPlan,
  // Memory tools
  write_memory: execWriteMemory,
  search_memories: execSearchMemories,
  update_memory: execUpdateMemory,
  delete_memory: execDeleteMemory,
  // Reorient tools
  bulk_triage_tasks: execBulkTriageTasks,
  // ISC tools
  add_isc: execAddIsc,
  set_isc_met: execSetIscMet,
  remove_isc: execRemoveIsc,
  // Parts Inventory tools
  add_part: execAddPart,
  update_part: execUpdatePart,
  search_parts: execSearchParts,
  mark_part_installed: execMarkPartInstalled,
  link_part_to_task: execLinkPartToTask,
};

async function loadProfileOutcomes(userId) {
  const { data } = await supabase
    .from("user_profile")
    .select("profile")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    profile: data?.profile || {},
    outcomes: data?.profile?.desired_outcomes || [],
  };
}

async function saveProfileOutcomes(userId, profile, nextOutcomes) {
  const merged = { ...profile, desired_outcomes: nextOutcomes };
  const { error } = await supabase
    .from("user_profile")
    .upsert({ user_id: userId, profile: merged }, { onConflict: "user_id" });
  if (error) throw new Error(error.message || "Profile save failed");
}

async function execAddIsc(params, userId) {
  const { profile, outcomes } = await loadProfileOutcomes(userId);
  const next = addIscToOutcome(outcomes, params.outcome_id, params.statement);
  await saveProfileOutcomes(userId, profile, next);
  const found = next.find((o) => o.id === params.outcome_id);
  const added = found?.criteria?.[found.criteria.length - 1] || null;
  return {
    ok: true,
    outcome_id: params.outcome_id,
    isc_id: added?.id || null,
    statement: added?.statement || null,
    total: found?.criteria?.length || 0,
  };
}

async function execSetIscMet(params, userId) {
  const { profile, outcomes } = await loadProfileOutcomes(userId);
  const next = setIscMet(
    outcomes,
    params.outcome_id,
    params.isc_id,
    !!params.met
  );
  await saveProfileOutcomes(userId, profile, next);
  const found = next.find((o) => o.id === params.outcome_id);
  const prog = outcomesProgress([found]);
  return {
    ok: true,
    outcome_id: params.outcome_id,
    isc_id: params.isc_id,
    met: !!params.met,
    progress: prog,
  };
}

async function execRemoveIsc(params, userId) {
  const { profile, outcomes } = await loadProfileOutcomes(userId);
  const next = removeIscPure(outcomes, params.outcome_id, params.isc_id);
  await saveProfileOutcomes(userId, profile, next);
  return { ok: true, outcome_id: params.outcome_id, isc_id: params.isc_id };
}

async function execBulkTriageTasks(params, userId) {
  const result = await applyProjectReorient(userId, params.category_id, {
    decisions: params.decisions,
  });
  return {
    ok: true,
    applied: result.decisions_applied,
    total: result.decisions_total,
    errors: result.errors,
    summary: `Triaged ${result.decisions_applied}/${result.decisions_total} tasks in this project.`,
  };
}

async function execWriteMemory(params, userId) {
  const importance = Number.isFinite(params.importance) ? params.importance : 6;
  const row = await writeMemory(userId, {
    scope_type: params.scope_type,
    scope_id: params.scope_id || null,
    kind: params.kind,
    content: params.content,
    importance,
    confidence: 0.85,
    source: "chat",
  });
  return {
    ok: true,
    id: row.id,
    summary: `Stored ${row.kind} memory (${row.scope_type}${row.scope_id ? `:${row.scope_id}` : ""}, importance ${row.importance})`,
  };
}

async function execSearchMemories(params, userId) {
  const hits = await searchMemories(userId, {
    query: params.query,
    scope_type: params.scope_type || null,
    scope_id: params.scope_id || null,
    top_k: Math.max(1, Math.min(20, params.top_k || 5)),
    markUsed: true,
  });
  return {
    ok: true,
    count: hits.length,
    memories: hits.map((m) => ({
      id: m.id,
      kind: m.kind,
      scope_type: m.scope_type,
      scope_id: m.scope_id,
      content: m.content,
      importance: m.importance,
      similarity: Number(m.similarity?.toFixed?.(3) ?? 0),
    })),
  };
}

async function execUpdateMemory(params, userId) {
  if (!params.memory_id) throw new Error("memory_id is required.");
  const updated = await updateMemory(userId, params.memory_id, {
    content: params.content,
    kind: params.kind,
    importance: params.importance,
    scope_type: params.scope_type,
    scope_id: params.scope_id,
  });
  return {
    ok: true,
    memory: updated,
    summary: `Updated ${updated.kind} memory (${updated.scope_type}${updated.scope_id ? `:${updated.scope_id}` : ""}, importance ${updated.importance})`,
  };
}

async function execDeleteMemory(params, userId) {
  if (!params.memory_id) throw new Error("memory_id is required.");
  if (params.hard === true) {
    await deleteMemory(userId, params.memory_id);
    return { ok: true, deleted: "hard", memory_id: params.memory_id };
  }
  await archiveMemory(params.memory_id);
  return {
    ok: true,
    deleted: "soft (archived)",
    memory_id: params.memory_id,
    note: "Row preserved with archived_at set — pass hard=true to permanently delete.",
  };
}

async function execAddPart(params, userId) {
  const row = await addPart(userId, {
    category_id: params.category_id,
    name: params.name,
    part_number: params.part_number,
    manufacturer: params.manufacturer,
    qty: params.qty,
    status: params.status,
    location: params.location,
    workstream: params.workstream,
    spec: params.spec,
    notes: params.notes,
    source_ref: params.source_ref,
  });
  return {
    ok: true,
    id: row.id,
    summary: `Logged ${row.qty}× ${row.name}${row.part_number ? ` (${row.part_number})` : ""} — ${row.status}${row.location ? ` ${row.location}` : ""}${row.workstream ? ` ws:${row.workstream}` : ""}`,
  };
}

async function execUpdatePart(params, userId) {
  const { part_id, ...patch } = params;
  if (!part_id) throw new Error("part_id required");
  const updated = await updatePart(userId, part_id, patch);
  return {
    ok: true,
    id: updated.id,
    summary: `Updated ${updated.name} — status ${updated.status}${updated.location ? ` ${updated.location}` : ""}`,
  };
}

async function execSearchParts(params, userId) {
  const opts = {
    category_id: params.category_id,
    status: params.status,
    workstream: params.workstream,
    location: params.location,
    limit: params.limit || 50,
  };
  const rows = params.query
    ? await searchPartsLib(userId, { ...opts, query: params.query })
    : await listParts(userId, opts);
  return {
    ok: true,
    count: rows.length,
    parts: rows.map((p) => ({
      id: p.id,
      name: p.name,
      part_number: p.part_number,
      manufacturer: p.manufacturer,
      qty: p.qty,
      status: p.status,
      location: p.location,
      workstream: p.workstream,
      spec: p.spec,
      notes: p.notes,
    })),
  };
}

async function execMarkPartInstalled(params, userId) {
  const updated = await markInstalled(userId, params.part_id, params.installed_at || null);
  return {
    ok: true,
    id: updated.id,
    summary: `Marked ${updated.name} installed at ${updated.installed_at}.`,
  };
}

async function execLinkPartToTask(params, userId) {
  const link = await linkPartToTask(
    userId,
    params.task_id,
    params.part_id,
    params.role || "installs"
  );
  return {
    ok: true,
    task_id: link.task_id,
    part_id: link.part_id,
    role: link.role,
    summary: `Linked part ${link.part_id} to task ${link.task_id} as ${link.role}.`,
  };
}

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
