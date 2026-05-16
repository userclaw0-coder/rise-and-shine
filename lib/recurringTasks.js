// Recurring task primitive — spawn engine & date math.
//
// Three recurrence modes (see db/RECURRING_TASKS_SCHEMA.sql for full spec):
//   * interval — next_spawn_at = completion_time + interval_days
//   * calendar — next_spawn_at = nextCalendarOccurrence(rule, last_spawn or today)
//   * usage    — next_spawn_at = now() when counter crosses (usage_at_last_spawn + usage_interval)
//
// Calendar policy: skip past missed dates. Whenever we spawn, we set the new
// next_spawn_at by walking strictly forward from now, not from the missed slot.

import { TIMEZONE } from "./scoring.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// -------- date helpers (timezone-aware via Intl) --------

function localDateParts(date, tz = TIMEZONE) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    dow: dowMap[get("weekday")] ?? 0,
  };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Canonical "midnight local" representation. Noon UTC on the target date —
// safe for tz=America/New_York (the only one we serve today) and any tz
// with offset <= ±11h: the calendar date matches in both UTC-12 and UTC+12.
function dateAtUTCNoon(y, m, d) {
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00Z`
  );
}

function todayLocalStr(tz = TIMEZONE) {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

// -------- calendar rule evaluator --------

export function validateCalendarRule(rule) {
  if (!rule || typeof rule !== "object") {
    throw new Error("calendar_rule must be a JSON object");
  }
  if (rule.every === "week") {
    const days = Array.isArray(rule.on_dow) ? rule.on_dow : [rule.on_dow];
    if (days.length === 0 || days.some((d) => d == null || d < 0 || d > 6)) {
      throw new Error("calendar_rule.on_dow must be ints 0-6 (0=Sun..6=Sat)");
    }
    return;
  }
  if (rule.every === "month") {
    if (rule.on_day == null || rule.on_day < 1 || rule.on_day > 31) {
      throw new Error("calendar_rule.on_day must be 1-31");
    }
    return;
  }
  if (rule.every === "year") {
    if (rule.on_month == null || rule.on_month < 1 || rule.on_month > 12) {
      throw new Error("calendar_rule.on_month must be 1-12");
    }
    if (rule.on_day == null || rule.on_day < 1 || rule.on_day > 31) {
      throw new Error("calendar_rule.on_day must be 1-31");
    }
    return;
  }
  throw new Error(
    "calendar_rule.every must be one of: week | month | year"
  );
}

function matchesCalendarRule(rule, parts) {
  if (rule.every === "week") {
    const days = Array.isArray(rule.on_dow) ? rule.on_dow : [rule.on_dow];
    return days.includes(parts.dow);
  }
  if (rule.every === "month") {
    const target = Math.min(rule.on_day, daysInMonth(parts.y, parts.m));
    return parts.d === target;
  }
  if (rule.every === "year") {
    if (parts.m !== rule.on_month) return false;
    const target = Math.min(rule.on_day, daysInMonth(parts.y, parts.m));
    return parts.d === target;
  }
  return false;
}

export function nextCalendarOccurrence(
  rule,
  fromDate,
  { mode = "strictly_after", tz = TIMEZONE, maxDays = 800 } = {}
) {
  validateCalendarRule(rule);
  const start = mode === "strictly_after" ? 1 : 0;
  for (let i = start; i <= maxDays; i++) {
    const candidate = new Date(fromDate.getTime() + i * DAY_MS);
    const parts = localDateParts(candidate, tz);
    if (matchesCalendarRule(rule, parts)) {
      return dateAtUTCNoon(parts.y, parts.m, parts.d);
    }
  }
  throw new Error(
    `No calendar occurrence found within ${maxDays} days for rule ${JSON.stringify(rule)}`
  );
}

// -------- next_spawn_at scheduling --------

export function computeInitialNextSpawnAt(template, now = new Date()) {
  if (template.recurrence_type === "interval") {
    // First instance spawns immediately on creation.
    return now;
  }
  if (template.recurrence_type === "calendar") {
    return nextCalendarOccurrence(template.calendar_rule, now, {
      mode: "on_or_after",
    });
  }
  if (template.recurrence_type === "usage") {
    // No initial schedule — fires when counter crosses threshold.
    return null;
  }
  throw new Error(`Unknown recurrence_type: ${template.recurrence_type}`);
}

export function computeNextSpawnAfterCompletion(template, completedAt = new Date()) {
  if (template.recurrence_type !== "interval") return null;
  return new Date(completedAt.getTime() + template.interval_days * DAY_MS);
}

// -------- spawn engine --------

// Insert one task from a template. Idempotent against the partial unique
// index `tasks_one_open_per_template`: if another open instance exists,
// the insert fails with 23505 and we return null instead of throwing.
async function insertTaskFromTemplate(supabase, template, today) {
  const row = {
    user_id: template.user_id,
    title: template.title,
    status: "todo",
    priority: template.priority || "Medium",
    effort_hours: template.effort_hours ?? null,
    due_date: today,
    category_id: template.category_id || null,
    subcategory_id: template.subcategory_id || null,
    phase: template.phase || "immediate",
    notes: template.notes ?? null,
    recurring_template_id: template.id,
  };

  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select(
      "id, title, status, priority, effort_hours, due_date, phase, recurring_template_id"
    )
    .single();

  if (error) {
    if (error.code === "23505") return null; // open instance already exists
    throw error;
  }

  // Apply tags from template, if any.
  const tags = Array.isArray(template.tags) ? template.tags : [];
  if (tags.length > 0) {
    await ensureTagsForTask(supabase, template.user_id, data.id, tags);
  }

  await supabase.from("task_events").insert({
    user_id: template.user_id,
    task_id: data.id,
    event_type: "created",
    value: { source: "recurring_template", template_id: template.id },
  });

  return data;
}

// Tag helper duplicates ensureTaskTags from jarvis-tools.js but stays here
// to keep this module self-contained.
async function ensureTagsForTask(supabase, userId, taskId, tagNames) {
  const normalized = Array.from(
    new Set(
      tagNames
        .map((t) => String(t || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (normalized.length === 0) return;

  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", userId)
    .in("name", normalized);

  const byName = Object.fromEntries((existing || []).map((t) => [t.name, t.id]));
  const toCreate = normalized.filter((n) => !byName[n]);

  if (toCreate.length > 0) {
    const { data: inserted } = await supabase
      .from("tags")
      .insert(toCreate.map((name) => ({ user_id: userId, name })))
      .select("id, name");
    for (const t of inserted || []) byName[t.name] = t.id;
  }

  const links = normalized
    .map((n) => byName[n])
    .filter(Boolean)
    .map((tag_id) => ({ user_id: userId, task_id: taskId, tag_id }));
  if (links.length > 0) {
    await supabase.from("task_tags").upsert(links, {
      onConflict: "task_id,tag_id",
      ignoreDuplicates: true,
    });
  }
}

// After a successful spawn, advance the template's bookkeeping per its mode.
async function advanceTemplateAfterSpawn(supabase, template, spawnedAt) {
  const update = {
    last_spawned_at: spawnedAt.toISOString(),
  };

  if (template.recurrence_type === "calendar") {
    update.next_spawn_at = nextCalendarOccurrence(
      template.calendar_rule,
      spawnedAt,
      { mode: "strictly_after" }
    ).toISOString();
  } else if (template.recurrence_type === "interval") {
    // Don't schedule again until the spawned task is completed.
    update.next_spawn_at = null;
  } else if (template.recurrence_type === "usage") {
    update.next_spawn_at = null;
    if (template.usage_counter_id) {
      const { data: counter } = await supabase
        .from("usage_counters")
        .select("current_value")
        .eq("id", template.usage_counter_id)
        .maybeSingle();
      if (counter) {
        update.usage_at_last_spawn = counter.current_value;
      }
    }
  }

  await supabase
    .from("recurring_task_templates")
    .update(update)
    .eq("id", template.id);
}

// Arm any usage-type template whose counter has advanced past the threshold.
// Idempotent. Cheap to call before every spawn pass.
async function armUsageDueTemplates(supabase, userId) {
  const { data: templates } = await supabase
    .from("recurring_task_templates")
    .select("id, usage_counter_id, usage_interval, usage_at_last_spawn")
    .eq("user_id", userId)
    .eq("recurrence_type", "usage")
    .eq("active", true)
    .is("archived_at", null)
    .is("next_spawn_at", null);

  if (!templates || templates.length === 0) return;

  const counterIds = Array.from(
    new Set(templates.map((t) => t.usage_counter_id).filter(Boolean))
  );
  if (counterIds.length === 0) return;

  const { data: counters } = await supabase
    .from("usage_counters")
    .select("id, current_value")
    .in("id", counterIds);
  const byId = Object.fromEntries((counters || []).map((c) => [c.id, c]));

  for (const t of templates) {
    const counter = byId[t.usage_counter_id];
    if (!counter) continue;
    const base = t.usage_at_last_spawn ?? 0;
    if (counter.current_value - base >= t.usage_interval) {
      await supabase
        .from("recurring_task_templates")
        .update({ next_spawn_at: new Date().toISOString() })
        .eq("id", t.id);
    }
  }
}

// Main entry — call from MCP read paths and after counter bumps.
export async function spawnDueRecurringTemplates(supabase, userId) {
  await armUsageDueTemplates(supabase, userId);

  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("recurring_task_templates")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .is("archived_at", null)
    .not("next_spawn_at", "is", null)
    .lte("next_spawn_at", nowIso);

  if (error) throw error;
  if (!due || due.length === 0) return { spawned: 0, templates: [] };

  const today = todayLocalStr();
  const now = new Date();
  const spawned = [];

  for (const template of due) {
    try {
      const task = await insertTaskFromTemplate(supabase, template, today);
      if (task) {
        spawned.push({ template_id: template.id, task_id: task.id });
      }
      // Always advance bookkeeping — even if a duplicate blocked the insert,
      // we want to push next_spawn_at forward so we don't loop on this template.
      await advanceTemplateAfterSpawn(supabase, template, now);
    } catch (err) {
      // Don't let one bad template stall the whole pass.
      console.error(
        "recurringTasks: spawn failed for template",
        template.id,
        err
      );
    }
  }

  return { spawned: spawned.length, templates: spawned };
}

// Called from execCompleteTask when a task with recurring_template_id is done.
export async function scheduleAfterCompletion(supabase, taskId, userId) {
  const { data: task } = await supabase
    .from("tasks")
    .select("id, recurring_template_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!task || !task.recurring_template_id) return null;

  const { data: template } = await supabase
    .from("recurring_task_templates")
    .select("*")
    .eq("id", task.recurring_template_id)
    .maybeSingle();
  if (!template || !template.active || template.archived_at) return null;

  const next = computeNextSpawnAfterCompletion(template);
  if (!next) return null;

  await supabase
    .from("recurring_task_templates")
    .update({
      next_spawn_at: next.toISOString(),
      last_completed_task_id: task.id,
    })
    .eq("id", template.id);

  return { template_id: template.id, next_spawn_at: next.toISOString() };
}

// Called from execUpdateUsageCounter after the counter value advances.
export async function checkUsageThresholds(supabase, userId, counterId) {
  const { data: counter } = await supabase
    .from("usage_counters")
    .select("id, current_value")
    .eq("id", counterId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!counter) return { armed: 0 };

  const { data: templates } = await supabase
    .from("recurring_task_templates")
    .select("id, usage_interval, usage_at_last_spawn, next_spawn_at, active, archived_at")
    .eq("user_id", userId)
    .eq("usage_counter_id", counterId)
    .eq("recurrence_type", "usage")
    .eq("active", true)
    .is("archived_at", null);

  let armed = 0;
  for (const t of templates || []) {
    if (t.next_spawn_at) continue; // already armed
    const base = t.usage_at_last_spawn ?? 0;
    if (counter.current_value - base >= t.usage_interval) {
      await supabase
        .from("recurring_task_templates")
        .update({ next_spawn_at: new Date().toISOString() })
        .eq("id", t.id);
      armed++;
    }
  }
  return { armed };
}
