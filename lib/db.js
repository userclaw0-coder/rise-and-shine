import { supabase } from "./supabaseClient";

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

export function updateTemplateOrder(items) {
  // items: [{id, sort_order}]
  return wrap(supabase.from("daily_template_items").upsert(items));
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
      : nextStatus;

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
  return wrap(
    supabase
      .from("task_events")
      .insert({
        user_id: userId,
        task_id: taskId,
        event_type: eventType,
        value,
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
  const start = new Date(dateStr);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
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

// Analytics: completed events in date range (for charts and table)
export function getCompletedEventsInRange(userId, startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  end.setDate(end.getDate() + 1);
  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, created_at, value")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
  );
}

// Last N completed events with task title (for "Completed tasks with timestamps" table)
export function getLastCompletedEventsWithTasks(userId, limit = 50) {
  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, created_at, value, task:tasks(title)")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
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
  return wrap(
    supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title: payload.title,
        status: payload.status || "todo",
        priority: payload.priority || "Medium",
        effort_hours: payload.effort_hours ?? null,
        due_date: payload.due_date ?? null,
        parent_task_id: payload.parent_task_id ?? null,
        category_id: categoryId,
        subcategory_id: payload.subcategory_id ?? null,
      })
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

// Ideas
export function getIdeas(userId) {
  return wrap(
    supabase
      .from("ideas")
      .select("id, title, details, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
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

// Health: body weight (schema: weight, unit, measured_at)
export function getBodyWeightLogs(userId, limit = 90) {
  return wrap(
    supabase
      .from("body_weight_logs")
      .select("id, weight, unit, measured_at, note, created_at")
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



