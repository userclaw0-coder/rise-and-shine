// Pre-compute auto-decompose pipeline.
//
// When a chunky task is about to surface as the project's next-action, the
// system silently breaks it down into ≤30-min next-right-actions so the
// user sees a low-activation-energy leaf instead of an intimidating parent.
//
// Design constraint (load-bearing): the hardest part is getting started.
// Each emitted subtask must be doable in ≤30 min with zero decisions to
// make and zero missing context. When the user sits down they know exactly
// what to do.
//
// Recursion is INTER-completion: one level of decomposition per call. If
// the resulting leaf is itself still too big, the next completion will
// pick it up and decompose it again. This keeps each call fast and
// observable.
//
// Bottom-out: when the work is physically irreducible ("Install motor
// mount" — no decisions, no context-gathering, just hands on a wrench for
// hours), emit a single terminal subtask "Do 30 min on <parent title>"
// with is_terminal=true. The user spawns fresh 30-min chunks until they
// mark the parent complete.

import { createClient } from "@supabase/supabase-js";
import { chatCompletion } from "./ai-provider.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_EFFORT_HOURS = 0.5; // ≤30 min = no decomposition needed
const MAX_SUBTASKS = 6;       // cap to keep the leaf list focused
const KB_SNIPPET_CHARS = 1200;

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Should this task be auto-decomposed right now? Pure check on the row.
 */
export function isEligibleForDecompose(task) {
  if (!task) return false;
  if (task.status === "done") return false;
  if (task.archived_at) return false;
  if (task.is_terminal) return false;
  if (task.auto_decomposed) return false;
  const effort = task.effort_hours == null ? 0 : Number(task.effort_hours);
  return effort > MAX_EFFORT_HOURS;
}

const SYSTEM_PROMPT = `You break a too-big task into the smallest possible next-right-actions for someone who struggles with activation energy.

CORE PRINCIPLE: the hardest part of any task is getting started. Each subtask you emit must be doable in 30 minutes or less with zero decisions to make and zero missing context. When the user sits down, they should know exactly what to do — no "figure out", no "look into", no vague verbs.

LOGISTICS-FIRST: if the task requires inputs (specs, photos, manuals, parts, references), the FIRST subtask is a concrete GATHER/FIND/ORGANIZE precursor (e.g. "Locate the FDU torque-spec page in the Tesla service manual"), not the doing-work itself. Getting the inputs ready halves the activation energy of the actual work.

IRREDUCIBLE PHYSICAL WORK: if the task is hands-on physical work that genuinely cannot be split (e.g. "Install motor mount" — no decisions, no missing context, just hours under the car), output a SINGLE subtask titled "Do 30 min on <parent title>" with is_terminal=true. Do NOT pad with fake sub-steps. The user will spawn fresh 30-min sessions until they mark the parent complete.

Output strict JSON only. No prose, no markdown.
Schema: {"subtasks":[{"title":"verb-first action ≤200 chars","effort_minutes":N,"is_terminal":false}],"reasoning":"one-sentence why this breakdown"}`;

function buildUserPrompt({ task, projectName, mantra, kbSnippet }) {
  const minutes = task.effort_hours
    ? Math.round(Number(task.effort_hours) * 60)
    : null;
  const lines = [
    `PROJECT: ${projectName || "—"}`,
    mantra ? `MANTRA: ${mantra}` : null,
    `PARENT TASK: ${task.title}`,
    minutes ? `EFFORT ESTIMATE: ${minutes} min` : null,
    task.priority ? `PRIORITY: ${task.priority}` : null,
    kbSnippet ? `PROJECT KB (relevant excerpt):\n${kbSnippet}` : null,
    "",
    "Break this into ordered next-right-actions per the rules above. Return JSON only.",
  ].filter(Boolean);
  return lines.join("\n");
}

async function loadProjectContext(categoryId) {
  if (!categoryId) return { name: null, mantra: null, kbSnippet: null };
  const [{ data: cat }, { data: ws }] = await Promise.all([
    supabase
      .from("categories")
      .select("name, mantra")
      .eq("id", categoryId)
      .maybeSingle(),
    supabase
      .from("shared_project_workspaces")
      .select("knowledge_base")
      .eq("category_id", categoryId)
      .maybeSingle(),
  ]);
  const kb = ws?.knowledge_base || "";
  return {
    name: cat?.name || null,
    mantra: cat?.mantra || null,
    kbSnippet: kb ? kb.slice(0, KB_SNIPPET_CHARS) : null,
  };
}

async function hasOpenChildren(taskId) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("parent_task_id", taskId)
    .is("archived_at", null)
    .in("status", ["todo", "doing"])
    .limit(1);
  if (error) return false;
  return (data?.length || 0) > 0;
}

/**
 * Build a terminal "Do 30 min on …" fallback when the LLM either fails or
 * returns nothing usable. Better to surface a clearly-time-boxed leaf than
 * leave the user staring at a 4-hour parent.
 */
function terminalFallback(parentTitle) {
  return [
    {
      title: `Do 30 min on ${parentTitle}`.slice(0, 200),
      effort_minutes: 30,
      is_terminal: true,
    },
  ];
}

function normalizeSubtasks(raw, parentTitle) {
  if (!Array.isArray(raw)) return terminalFallback(parentTitle);
  const cleaned = raw
    .filter((s) => s && s.title)
    .slice(0, MAX_SUBTASKS)
    .map((s) => ({
      title: String(s.title).slice(0, 200),
      effort_minutes: Math.min(
        45,
        Math.max(5, Number(s.effort_minutes) || 25)
      ),
      is_terminal: !!s.is_terminal,
    }));
  return cleaned.length > 0 ? cleaned : terminalFallback(parentTitle);
}

/**
 * Insert subtasks under a parent, inheriting routing fields. Mirrors the
 * execCreateSubtasks pattern in jarvis-tools.js so the rows look identical
 * to anything an MCP client would create.
 */
async function insertSubtasks(userId, parent, subtasks) {
  const rows = subtasks.map((s) => ({
    user_id: userId,
    category_id: parent.category_id,
    subcategory_id: parent.subcategory_id || null,
    parent_task_id: parent.id,
    title: s.title,
    status: "todo",
    priority: parent.priority || "Medium",
    effort_hours: s.effort_minutes / 60,
    outcome_ids: parent.outcome_ids || [],
    primary_life_domain: parent.primary_life_domain || null,
    is_terminal: s.is_terminal,
  }));
  const { data, error } = await supabase
    .from("tasks")
    .insert(rows)
    .select("id, title, is_terminal");
  if (error) return { inserted: [], error: error.message };
  return { inserted: data || [], error: null };
}

/**
 * Entry point: decompose `taskId` if eligible. Idempotent, never throws.
 * Returns a diagnostic object — callers fire-and-forget but the shape is
 * useful for logging and the manual `decompose_task` MCP tool.
 */
export async function maybeDecomposeTask(userId, taskId) {
  if (!userId || !taskId) return { decomposed: false, reason: "missing_args" };

  try {
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select(
        "id, user_id, title, status, priority, effort_hours, category_id, subcategory_id, outcome_ids, primary_life_domain, auto_decomposed, is_terminal, archived_at"
      )
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (taskErr || !task) return { decomposed: false, reason: "task_not_found" };

    if (!isEligibleForDecompose(task)) {
      return { decomposed: false, reason: "not_eligible" };
    }

    // Respect existing manual subtasks — treat them as the user's preferred
    // decomposition. Lock the flag so we don't reconsider next time.
    if (await hasOpenChildren(task.id)) {
      await supabase
        .from("tasks")
        .update({ auto_decomposed: true })
        .eq("id", task.id);
      return { decomposed: false, reason: "has_existing_children" };
    }

    const ctx = await loadProjectContext(task.category_id);

    let subtasks;
    try {
      const result = await chatCompletion({
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserPrompt({
              task,
              projectName: ctx.name,
              mantra: ctx.mantra,
              kbSnippet: ctx.kbSnippet,
            }),
          },
        ],
        tier: "extractor",
      });
      const parsed = safeJsonParse(result?.content);
      subtasks = normalizeSubtasks(parsed?.subtasks, task.title);
    } catch {
      // LLM unavailable / timed out — fall back to terminal time-box so the
      // user still sees a low-AE next-action.
      subtasks = terminalFallback(task.title);
    }

    const { inserted, error: insErr } = await insertSubtasks(
      userId,
      task,
      subtasks
    );
    if (insErr) return { decomposed: false, reason: "insert_failed" };

    await supabase
      .from("tasks")
      .update({ auto_decomposed: true })
      .eq("id", task.id);

    return {
      decomposed: true,
      parent_id: task.id,
      created_count: inserted.length,
      terminal: subtasks.length === 1 && subtasks[0].is_terminal,
    };
  } catch {
    return { decomposed: false, reason: "exception" };
  }
}
