import { supabase } from "./supabaseClient";
import { TIMEZONE } from "./scoring";

// Basic helper for consistent error handling
function wrap(resultPromise) {
  return resultPromise.then(({ data, error }) => {
    return { data, error };
  });
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

// User profile (vision, preferences, constraints)
export function getUserProfile(userId) {
  return wrap(
    supabase
      .from("user_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
  );
}

export function upsertUserProfile(userId, profile) {
  return wrap(
    supabase
      .from("user_profile")
      .upsert(
        {
          user_id: userId,
          profile,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single()
  );
}

// User profile versions (history for Vision)
export function createUserProfileVersion(userId, profile, label) {
  return wrap(
    supabase
      .from("user_profile_versions")
      .insert({
        user_id: userId,
        label: label || null,
        profile,
      })
      .select("id, created_at, label")
      .single()
  );
}

export function listUserProfileVersions(userId, limit = 10) {
  return wrap(
    supabase
      .from("user_profile_versions")
      .select("id, created_at, label")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

export function getUserProfileVersion(userId, versionId) {
  return wrap(
    supabase
      .from("user_profile_versions")
      .select("id, created_at, label, profile")
      .eq("user_id", userId)
      .eq("id", versionId)
      .maybeSingle()
  );
}

// Templates
export function getTemplates() {
  return wrap(
    supabase
      .from("daily_templates")
      .select("*")
      .order("created_at", { ascending: true })
  );
}

export async function setDefaultTemplate(templateId) {
  // set all false then one true
  const user = await getUser();
  if (!user) throw new Error("Not logged in");

  await supabase
    .from("daily_templates")
    .update({ is_default: false })
    .eq("user_id", user.id);

  return wrap(
    supabase
      .from("daily_templates")
      .update({ is_default: true })
      .eq("id", templateId)
      .eq("user_id", user.id)
  );
}

export function getTemplateItems(templateId) {
  return wrap(
    supabase
      .from("daily_template_items")
      .select(
        "id, sort_order, task:tasks(id,title,priority,status,effort_hours,parent_task_id)"
      )
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
  );
}

export async function updateTemplateOrder(items) {
  // items: [{id, sort_order}] — single atomic update so no partial state on failure
  const { error } = await supabase.rpc("update_daily_template_items_order", {
    p_items: items,
  });
  if (error) return { data: null, error };
  return { data: null, error: null };
}

export async function getDailyRepeatTasksNotInTemplate(userId, templateId) {
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", "Daily Repeat")
    .limit(1)
    .maybeSingle();
  if (!cat) return { data: [], error: null };
  const { data: existing } = await supabase
    .from("daily_template_items")
    .select("task_id")
    .eq("template_id", templateId);
  const inTemplate = new Set((existing || []).map((r) => r.task_id));
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, priority")
    .eq("user_id", userId)
    .eq("category_id", cat.id)
    .neq("status", "archived");
  if (error) return { data: null, error };
  const filtered = (tasks || []).filter((t) => !inTemplate.has(t.id));
  return { data: filtered, error: null };
}

/** Get or create the "Daily Repeat" category for template items. */
export async function getOrCreateDailyRepeatCategory(userId) {
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", "Daily Repeat")
    .limit(1)
    .maybeSingle();
  if (cat) return { data: cat.id, error: null };
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: "Daily Repeat" })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: created.id, error: null };
}

export async function addTemplateItem(userId, templateId, taskId) {
  const { data: maxRow } = await supabase
    .from("daily_template_items")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;
  return wrap(
    supabase
      .from("daily_template_items")
      .insert({
        user_id: userId,
        template_id: templateId,
        task_id: taskId,
        sort_order: nextOrder,
      })
      .select()
      .single()
  );
}

export function removeTemplateItem(itemId) {
  return wrap(
    supabase.from("daily_template_items").delete().eq("id", itemId)
  );
}

/** All task_ids that appear in any of the user's daily templates (for analytics: daily vs other). */
export async function getDailyTemplateTaskIds(userId) {
  const { data: templates, error: te } = await supabase
    .from("daily_templates")
    .select("id")
    .eq("user_id", userId);
  if (te || !templates?.length) return { data: new Set(), error: te };
  const { data: items, error: ie } = await supabase
    .from("daily_template_items")
    .select("task_id")
    .in("template_id", templates.map((t) => t.id));
  if (ie) return { data: new Set(), error: ie };
  const set = new Set((items || []).map((r) => r.task_id).filter(Boolean));
  return { data: set, error: null };
}

// Tasks + events

export async function getBacklogTasks(userId, options = {}) {
  // By default returns non-archived tasks only. Pass { includeArchived: true }
  // to include archived (e.g. Backlog page when showing "Archived" filter).
  const { includeArchived = false } = options;
  let q = supabase
    .from("tasks")
    .select(
      `
      id,
      title,
      status,
      priority,
      effort_hours,
      due_date,
      parent_task_id,
      archived_at,
      category_id,
      category:categories(name),
      subcategory:subcategories(name),
      subcategory_id,
      outcome_ids,
      primary_life_domain,
      life_domains,
      alignment_source,
      tags:task_tags(
        tag:tags(name)
      )
    `
    )
    .eq("user_id", userId);
  if (!includeArchived) {
    q = q.neq("status", "archived");
  }
  return wrap(q);
}

export async function updateTaskStatusWithEvent(userId, taskId, nextStatus) {
  // For non-daily tasks (Backlog): update tasks.status and log an event.
  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      status: nextStatus,
      archived_at: nextStatus === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (updateError) {
    return { data: null, error: updateError };
  }

  const eventType =
    nextStatus === "archived"
      ? "archived"
      : nextStatus === "todo"
      ? "restored"
      : nextStatus === "done"
      ? "completed"
      : nextStatus === "doing"
      ? "started"
      : "updated";

  const { data, error } = await supabase
    .from("task_events")
    .insert({
      user_id: userId,
      task_id: taskId,
      event_type: eventType,
    })
    .select()
    .single();

  return { data, error };
}

export function logTaskEvent(userId, taskId, eventType, value = null) {
  const legacyRefinementMap = {
    planner_refinement_accepted: "accept",
    planner_refinement_dismissed: "dismiss",
    planner_refinement_applied: "applied",
  };

  const normalizedEventType = legacyRefinementMap[eventType] ? "updated" : eventType;
  const normalizedValue = legacyRefinementMap[eventType]
    ? {
        ...(value && typeof value === "object" ? value : {}),
        source: "planner_refinement",
        action: legacyRefinementMap[eventType],
      }
    : value;

  return wrap(
    supabase
      .from("task_events")
      .insert({
        user_id: userId,
        task_id: taskId,
        event_type: normalizedEventType,
        value: normalizedValue,
      })
      .select()
      .single()
  );
}

// Workout completion: task_events.task_id is UUID, so we use a single "Workout" task and store date in value
export async function getOrCreateWorkoutTaskId(userId) {
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", "Daily Repeat")
    .limit(1)
    .maybeSingle();
  const categoryId = cat?.id;
  if (!categoryId) return { data: null, error: { message: "No Daily Repeat category" } };
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .ilike("title", "%Workout%")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { data: existing.id, error: null };
  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: "Workout (daily)",
      status: "todo",
      category_id: categoryId,
    })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: created.id, error: null };
}

export function getTaskEventsForTasksOnDate(userId, taskIds, dateStr) {
  const { start, end } = localDateToUtcRange(dateStr, TIMEZONE);
  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, event_type, created_at, value")
      .eq("user_id", userId)
      .in("task_id", taskIds)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true })
  );
}

export function getLastCompletedEventsForUser(userId) {
  // Most recent "completed" event per task (resolved client-side).
  return wrap(
    supabase
      .from("task_events")
      .select("task_id, event_type, created_at")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .order("created_at", { ascending: true })
  );
}

/**
 * Returns UTC Date bounds for the given local date string (YYYY-MM-DD) in the given IANA timezone.
 * start = midnight start of that day in TZ (as UTC); end = midnight start of next day in TZ (as UTC).
 * So the range [start, end) covers the full calendar day in that timezone.
 */
function localDateToUtcRange(dateStr, timezone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) {
    const fallback = new Date(dateStr + "T12:00:00Z");
    return { start: fallback, end: fallback };
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  let tNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  let parts = formatter.formatToParts(tNoon);
  const part = (k) => parts.find((p) => p.type === k)?.value ?? "0";
  let tzY = parseInt(part("year"), 10);
  let tzM = parseInt(part("month"), 10);
  let tzD = parseInt(part("day"), 10);
  if (tzY < y || (tzY === y && tzM < m) || (tzY === y && tzM === m && tzD < d)) {
    // If local time at UTC noon landed earlier than the requested calendar date
    // (e.g. very positive offset), move forward to the *next* day at local noon
    // using a valid hour value (0) instead of relying on hour=24 rollover.
    tNoon = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
    parts = formatter.formatToParts(tNoon);
    tzY = parseInt(part("year"), 10);
    tzM = parseInt(part("month"), 10);
    tzD = parseInt(part("day"), 10);
    // After moving forward, the new local date may now be ahead of requested; if so,
    // snap to start of requested day so we get correct UTC boundaries.
    if (tzY > y || (tzY === y && tzM > m) || (tzY === y && tzM === m && tzD > d)) {
      tNoon = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      parts = formatter.formatToParts(tNoon);
    }
  } else if (tzY > y || (tzY === y && tzM > m) || (tzY === y && tzM === m && tzD > d)) {
    tNoon = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    parts = formatter.formatToParts(tNoon);
  }
  const hour = parseInt(part("hour"), 10);
  const minute = parseInt(part("minute"), 10);
  const second = parseInt(part("second"), 10);
  const start = new Date(tNoon.getTime() - (hour * 3600 + minute * 60 + second) * 1000);
  const endDay = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0, 0));
  const endParts = formatter.formatToParts(endDay);
  const endPart = (k) => endParts.find((p) => p.type === k)?.value ?? "0";
  const endHour = parseInt(endPart("hour"), 10);
  const endMinute = parseInt(endPart("minute"), 10);
  const endSecond = parseInt(endPart("second"), 10);
  const end = new Date(endDay.getTime() - (endHour * 3600 + endMinute * 60 + endSecond) * 1000);
  return { start, end };
}

/** Given YYYY-MM-DD, return YYYY-MM-DD for the next calendar day (for exclusive end bounds). */
function nextDayDateStr(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Analytics: completed events in date range (for charts and table).
// startDateStr/endDateStr are local date YYYY-MM-DD in app TIMEZONE; range is [start, end) in UTC (full calendar days in TZ).
// Exclusive upper bound is midnight of the day *after* endDateStr so the full end date is included.
export function getCompletedEventsInRange(userId, startDateStr, endDateStr) {
  const { start } = localDateToUtcRange(startDateStr, TIMEZONE);
  const endExclusive = localDateToUtcRange(nextDayDateStr(endDateStr), TIMEZONE).start;
  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, created_at, value")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", start.toISOString())
      .lt("created_at", endExclusive.toISOString())
      .order("created_at", { ascending: false })
  );
}

// Last N completed events with task title (for "Completed tasks with timestamps" table)
export function getLastCompletedEventsWithTasks(userId, limit = 50) {
  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, created_at, value, task:tasks(title, outcome_ids, primary_life_domain, life_domains, alignment_source)")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

// Planner refinement analytics events in date range
export { getPlannerRefinementEventsInRange } from "./db/planner-refinement-events";

// Daily plan (Next 3 Actions queue) – DATA_MODEL.md, db/DAILY_PLAN_SCHEMA.sql
export function getDailyPlan(userId, dateStr) {
  return wrap(
    supabase
      .from("daily_plans")
      .select("id, date, mode, queue, refill_policy, refilled_count, last_refilled_at, created_at, updated_at")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .maybeSingle()
  );
}

export function createDailyPlan(userId, dateStr, mode = "Strategic Push", queue = []) {
  return wrap(
    supabase
      .from("daily_plans")
      .insert({
        user_id: userId,
        date: dateStr,
        mode: mode || "Strategic Push",
        queue: Array.isArray(queue) ? queue : [],
        refill_policy: "refill_when_all_done",
        refilled_count: 0,
      })
      .select()
      .single()
  );
}

export function updateDailyPlan(planId, updates) {
  const payload = {};
  if (updates.queue !== undefined) payload.queue = updates.queue;
  if (updates.refilled_count !== undefined) payload.refilled_count = updates.refilled_count;
  if (updates.last_refilled_at !== undefined) payload.last_refilled_at = updates.last_refilled_at;
  if (updates.mode !== undefined) payload.mode = updates.mode;
  if (Object.keys(payload).length === 0) return Promise.resolve({ data: null, error: null });
  return wrap(
    supabase
      .from("daily_plans")
      .update(payload)
      .eq("id", planId)
      .select()
      .single()
  );
}

/** Get existing plan for date or create one with empty queue. */
export async function getOrCreateDailyPlan(userId, dateStr, mode = "Strategic Push") {
  const res = await getDailyPlan(userId, dateStr);
  if (res.error) return res;
  if (res.data) return { data: res.data, error: null };
  return createDailyPlan(userId, dateStr, mode, []);
}

// Task CRUD + tags

export async function createTask(userId, payload) {
  let categoryId = payload.category_id ?? null;
  if (categoryId == null) {
    const { data: firstCat } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    categoryId = firstCat?.id ?? null;
  }
  if (categoryId == null) {
    return { data: null, error: { message: "No category found. Create a category first (e.g. via bootstrap)." } };
  }
  const row = {
    user_id: userId,
    title: payload.title,
    status: payload.status || "todo",
    priority: payload.priority || "Medium",
    effort_hours: payload.effort_hours ?? null,
    due_date: payload.due_date ?? null,
    parent_task_id: payload.parent_task_id ?? null,
    category_id: categoryId,
    subcategory_id: payload.subcategory_id ?? null,
  };
  if (payload.outcome_ids !== undefined) row.outcome_ids = Array.isArray(payload.outcome_ids) ? payload.outcome_ids : [];
  if (payload.primary_life_domain !== undefined) row.primary_life_domain = payload.primary_life_domain || null;
  if (payload.life_domains !== undefined) row.life_domains = Array.isArray(payload.life_domains) ? payload.life_domains : [];
  if (payload.alignment_source !== undefined) row.alignment_source = payload.alignment_source || null;
  return wrap(
    supabase
      .from("tasks")
      .insert(row)
      .select("*")
      .single()
  );
}

export function updateTask(userId, taskId, updates) {
  const allowed = {
    title: updates.title,
    priority: updates.priority,
    effort_hours: updates.effort_hours,
    due_date: updates.due_date,
    category_id: updates.category_id,
    subcategory_id: updates.subcategory_id,
    status: updates.status,
    archived_at:
      updates.status === "archived"
        ? new Date().toISOString()
        : updates.status === "todo" || updates.status === "doing"
        ? null
        : updates.archived_at,
    outcome_ids: updates.outcome_ids !== undefined ? (Array.isArray(updates.outcome_ids) ? updates.outcome_ids : []) : undefined,
    primary_life_domain: updates.primary_life_domain !== undefined ? (updates.primary_life_domain || null) : undefined,
    life_domains: updates.life_domains !== undefined ? (Array.isArray(updates.life_domains) ? updates.life_domains : []) : undefined,
    alignment_source: updates.alignment_source !== undefined ? (updates.alignment_source || null) : undefined,
  };

  Object.keys(allowed).forEach((key) => {
    if (allowed[key] === undefined) {
      delete allowed[key];
    }
  });

  return wrap(
    supabase
      .from("tasks")
      .update(allowed)
      .eq("id", taskId)
      .eq("user_id", userId)
      .select("*")
      .single()
  );
}

export async function setTaskTags(userId, taskId, tagNames) {
  const names = Array.from(
    new Set(
      (tagNames || [])
        .map((t) => (t || "").trim())
        .filter((t) => t.length > 0)
    )
  );

  if (names.length === 0) {
    // Clear tags
    const { error } = await supabase
      .from("task_tags")
      .delete()
      .eq("user_id", userId)
      .eq("task_id", taskId);
    return { data: null, error };
  }

  // Ensure tags exist (schema: tags have name, no slug; match by user_id + name)
  const createdTagIds = [];
  for (const name of names) {
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing) {
      createdTagIds.push(existing.id);
      continue;
    }
    const { data: inserted, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (error) return { data: null, error };
    createdTagIds.push(inserted.id);
  }

  // Reset task_tags
  const { error: delError } = await supabase
    .from("task_tags")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId);
  if (delError) {
    return { data: null, error: delError };
  }

  const inserts = createdTagIds.map((tagId) => ({
    user_id: userId,
    task_id: taskId,
    tag_id: tagId,
  }));

  return wrap(supabase.from("task_tags").insert(inserts));
}

export function getCategoriesWithSubcategories(userId) {
  return wrap(
    supabase
      .from("categories")
      .select("id, name, subcategories(id, name)")
      .eq("user_id", userId)
      .order("name", { ascending: true })
  );
}

export async function createCategory(userId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return { data: null, error: { message: "Category name is required." } };
  return wrap(
    supabase
      .from("categories")
      .insert({ user_id: userId, name: trimmed })
      .select()
      .single()
  );
}

export async function updateCategory(userId, categoryId, patch) {
  if (!categoryId) {
    return { data: null, error: { message: "Category id is required." } };
  }
  const payload = { ...(patch || {}) };
  if (payload.name != null) {
    payload.name = String(payload.name || "").trim();
    if (!payload.name) {
      return { data: null, error: { message: "Category name is required." } };
    }
  }
  return wrap(
    supabase
      .from("categories")
      .update(payload)
      .eq("id", categoryId)
      .eq("user_id", userId)
      .select("id,name")
      .single()
  );
}

/**
 * Returns the number of tasks that reference this category (for this user).
 */
export async function getTaskCountByCategory(userId, categoryId) {
  if (!categoryId) return { data: 0, error: null };
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("category_id", categoryId);
  return { data: count ?? 0, error };
}

export async function deleteCategory(userId, categoryId) {
  if (!categoryId) {
    return { data: null, error: { message: "Category id is required." } };
  }
  const { data: taskCount, error: countError } = await getTaskCountByCategory(userId, categoryId);
  if (countError) {
    return { data: null, error: countError };
  }
  if (taskCount > 0) {
    return {
      data: null,
      error: {
        message: `Cannot delete: ${taskCount} task(s) use this category. Reassign them to another category first.`,
      },
    };
  }
  return wrap(
    supabase
      .from("categories")
      .delete()
      .eq("id", categoryId)
      .eq("user_id", userId)
  );
}

export async function ensureSubcategory(userId, categoryId, name) {
  const trimmed = (name || "").trim();
  if (!categoryId) return { data: null, error: { message: "Select a category first." } };
  if (!trimmed) return { data: null, error: null };

  const { data: existing, error: existingErr } = await supabase
    .from("subcategories")
    .select("id,name")
    .eq("category_id", categoryId)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existingErr) return { data: null, error: existingErr };
  if (existing) return { data: existing, error: null };

  return wrap(
    supabase
      .from("subcategories")
      .insert({ user_id: userId, category_id: categoryId, name: trimmed })
      .select("id,name")
      .single()
  );
}

export function getAllTags(userId) {
  return wrap(
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("user_id", userId)
      .order("name", { ascending: true })
  );
}

// Daily notes (schema: date, note)
export function getDailyNotes(userId, limit = 50) {
  return wrap(
    supabase
      .from("daily_notes")
      .select("id, date, note, created_at, updated_at")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(limit)
  );
}

export function getDailyNoteForDate(userId, dateStr) {
  return wrap(
    supabase
      .from("daily_notes")
      .select("id, date, note, created_at, updated_at")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .maybeSingle()
  );
}

export function upsertDailyNote(userId, dateStr, noteContent) {
  return wrap(
    supabase
      .from("daily_notes")
      .upsert(
        {
          user_id: userId,
          date: dateStr,
          note: noteContent || "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" }
      )
      .select()
      .single()
  );
}

// Multi-note (multiple notes per day; optional title; table: notes with id, user_id, title, body, created_at)
export function getNotes(userId, limit = 100) {
  return wrap(
    supabase
      .from("notes")
      .select("id, title, body, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

export function createNote(userId, payload) {
  return wrap(
    supabase
      .from("notes")
      .insert({
        user_id: userId,
        title: (payload.title || "").trim() || null,
        body: payload.body ?? "",
      })
      .select()
      .single()
  );
}

export function updateNote(userId, noteId, payload) {
  const allowed = {};
  if (payload.title !== undefined) allowed.title = (payload.title || "").trim() || null;
  if (payload.body !== undefined) allowed.body = payload.body ?? "";
  if (Object.keys(allowed).length === 0) return Promise.resolve({ data: null, error: null });
  return wrap(
    supabase
      .from("notes")
      .update(allowed)
      .eq("id", noteId)
      .eq("user_id", userId)
      .select()
      .single()
  );
}

// Ideas
export function getIdeas(userId, opts = {}) {
  let q = supabase
    .from("ideas")
    .select("id, title, details, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (opts.archivedOnly) {
    q = q.eq("status", "archived");
  } else if (!opts.includeArchived) {
    q = q.neq("status", "archived");
  }
  return wrap(q);
}

export function archiveIdea(userId, ideaId) {
  return wrap(
    supabase
      .from("ideas")
      .update({ status: "archived" })
      .eq("id", ideaId)
      .eq("user_id", userId)
      .select()
      .single()
  );
}

export function createIdea(userId, payload) {
  return wrap(
    supabase
      .from("ideas")
      .insert({
        user_id: userId,
        title: payload.title || "",
        details: payload.details ?? null,
        status: payload.status || "new",
      })
      .select()
      .single()
  );
}

export function updateIdea(userId, ideaId, updates) {
  const allowed = {};
  if (updates.title !== undefined) allowed.title = updates.title;
  if (updates.details !== undefined) allowed.details = updates.details;
  if (updates.status !== undefined) allowed.status = updates.status;
  if (Object.keys(allowed).length === 0) return Promise.resolve({ data: null, error: null });
  return wrap(
    supabase
      .from("ideas")
      .update(allowed)
      .eq("id", ideaId)
      .eq("user_id", userId)
      .select()
      .single()
  );
}

export async function promoteIdeaToTask(userId, ideaId) {
  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .select("id, title, details")
    .eq("id", ideaId)
    .eq("user_id", userId)
    .single();
  if (ideaError || !idea) return { data: null, error: ideaError || new Error("Idea not found") };

  let { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", "Business")
    .limit(1)
    .maybeSingle();
  if (!cat?.id) {
    const first = await supabase.from("categories").select("id").eq("user_id", userId).limit(1).maybeSingle();
    cat = first.data;
  }
  const categoryId = cat?.id;
  if (!categoryId) {
    return { data: null, error: { message: "No category found. Run bootstrap or create a category." } };
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: idea.title,
      status: "todo",
      priority: "Medium",
      category_id: categoryId,
    })
    .select()
    .single();
  if (taskError) return { data: null, error: taskError };

  await supabase.from("task_events").insert({
    user_id: userId,
    task_id: task.id,
    event_type: "created",
    value: { source: "idea", idea_id: ideaId },
  });
  await supabase.from("ideas").update({ status: "promoted" }).eq("id", ideaId).eq("user_id", userId);
  return { data: task, error: null };
}

// Weekly review / human_needs_weekly
export function getWeeklyReview(userId, weekStart) {
  return wrap(
    supabase
      .from("human_needs_weekly")
      .select("user_id, week_start, scores, notes, created_at")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle()
  );
}

export function upsertWeeklyReview(userId, weekStart, payload) {
  const scores = payload.updated_human_needs || payload.scores || null;
  const notesObj = {
    week_summary: payload.week_summary || "",
    wins: payload.wins || "",
    friction: payload.friction || "",
    reality_check: payload.reality_check || "",
    lowest_need_focus: payload.lowest_need_focus || null,
    weekly_theme: payload.weekly_theme || null,
  };
  return wrap(
    supabase
      .from("human_needs_weekly")
      .upsert(
        {
          user_id: userId,
          week_start: weekStart,
          scores,
          notes: JSON.stringify(notesObj),
        },
        { onConflict: "user_id,week_start" }
      )
      .select("user_id, week_start, scores, notes, created_at")
      .single()
  );
}

export function listWeeklyReviews(userId, limit = 20) {
  return wrap(
    supabase
      .from("human_needs_weekly")
      .select("user_id, week_start, scores, notes, created_at")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(limit)
  );
}

export function getWeeklyReviewWeeks(userId, limit = 52) {
  return wrap(
    supabase
      .from("human_needs_weekly")
      .select("week_start")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(limit)
  );
}

// Health: body weight (schema: weight, unit, measured_at; no created_at)
export function getBodyWeightLogs(userId, limit = 90) {
  return wrap(
    supabase
      .from("body_weight_logs")
      .select("id, weight, unit, measured_at, note")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(limit)
  );
}

export function insertBodyWeightLog(userId, dateStr, weightValue, unit = "lb") {
  const measuredAt = new Date(dateStr + "T12:00:00.000Z").toISOString();
  return wrap(
    supabase
      .from("body_weight_logs")
      .insert({
        user_id: userId,
        weight: weightValue,
        unit: unit || "lb",
        measured_at: measuredAt,
      })
      .select()
      .single()
  );
}

// Health: lifting
export function getLiftingSessions(userId, limit = 30) {
  return wrap(
    supabase
      .from("lifting_sessions")
      .select("id, session_date, created_at")
      .eq("user_id", userId)
      .order("session_date", { ascending: false })
      .limit(limit)
  );
}

export function createLiftingSession(userId, sessionDate) {
  return wrap(
    supabase
      .from("lifting_sessions")
      .insert({ user_id: userId, session_date: sessionDate })
      .select()
      .single()
  );
}

export function getLiftingSets(sessionId) {
  return wrap(
    supabase
      .from("lifting_sets")
      .select("id, exercise, weight, reps, set_number, created_at")
      .eq("session_id", sessionId)
      .order("set_number", { ascending: true })
  );
}

/** Lifting sets with session date for exercise progress charts (weight over time per exercise). */
export function getLiftingSetsWithSession(userId, limit = 200) {
  return wrap(
    supabase
      .from("lifting_sets")
      .select("id, exercise, weight, reps, set_number, session:lifting_sessions(session_date)")
      .eq("user_id", userId)
      .order("set_number", { ascending: true })
      .limit(limit)
  );
}

export function addLiftingSet(userId, sessionId, payload) {
  return wrap(
    supabase
      .from("lifting_sets")
      .insert({
        user_id: userId,
        session_id: sessionId,
        exercise: payload.exercise_name || payload.exercise || "",
        weight: payload.weight_kg ?? payload.weight ?? null,
        reps: payload.reps ?? null,
        set_number: payload.set_number ?? null,
      })
      .select()
      .single()
  );
}


