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
        "id, sort_order, task:tasks(id,title,priority,status,category,effort_hours,parent_task_id)"
      )
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
  );
}

export function updateTemplateOrder(items) {
  // items: [{id, sort_order}]
  return wrap(supabase.from("daily_template_items").upsert(items));
}

// Tasks + events

export async function getBacklogTasks(userId) {
  // All non-archived tasks (excluding daily repeats by category name; Today
  // page will additionally exclude tasks attached to the default template).
  return wrap(
    supabase
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
      .eq("user_id", userId)
  );
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

export function logTaskEvent(userId, taskId, eventType, metadata = null) {
  return wrap(
    supabase
      .from("task_events")
      .insert({
        user_id: userId,
        task_id: taskId,
        event_type: eventType,
        metadata,
      })
      .select()
      .single()
  );
}

export function getTaskEventsForTasksOnDate(userId, taskIds, dateStr) {
  const start = new Date(dateStr);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return wrap(
    supabase
      .from("task_events")
      .select("id, task_id, event_type, created_at, metadata")
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

// Task CRUD + tags

export function createTask(userId, payload) {
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
        category_id: payload.category_id ?? null,
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

  // Ensure tags exist
  const createdTagIds = [];
  for (const name of names) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const { data, error } = await supabase
      .from("tags")
      .upsert(
        {
          user_id: userId,
          name,
          slug,
        },
        { onConflict: "user_id,slug" }
      )
      .select("id")
      .single();
    if (error) {
      return { data: null, error };
    }
    createdTagIds.push(data.id);
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
      .select("id, name, slug")
      .eq("user_id", userId)
      .order("name", { ascending: true })
  );
}



