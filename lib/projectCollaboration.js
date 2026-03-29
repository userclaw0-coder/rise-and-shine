import { createClient } from "@supabase/supabase-js";

import { defaultProjectWorkspace, mergeProjectWorkspace } from "./projectWorkspace";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TASK_SELECT = `
  id,
  user_id,
  title,
  status,
  priority,
  effort_hours,
  due_date,
  created_at,
  updated_at,
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
`;

function normalizeRole(role) {
  if (role === "owner" || role === "editor" || role === "viewer") return role;
  return "viewer";
}

export function canEditProjectRole(role) {
  return role === "owner" || role === "editor";
}

export function canManageProjectMembers(role) {
  return role === "owner";
}

function normalizeWorkspacePayload(raw, legacyLinks = "") {
  const base = defaultProjectWorkspace();
  const workspace = raw && typeof raw === "object" ? raw : {};
  const merged = {
    ...base,
    ...workspace,
    health_needs: {
      ...base.health_needs,
      ...(workspace.health_needs && typeof workspace.health_needs === "object"
        ? workspace.health_needs
        : {}),
    },
    suggested_moves: Array.isArray(workspace.suggested_moves) ? workspace.suggested_moves : [],
    resources: Array.isArray(workspace.resources) ? workspace.resources : [],
  };
  if (!merged.narrative?.trim() && legacyLinks?.trim()) merged._legacyLinksHint = true;
  return merged;
}

async function getAuthUserById(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await serviceSupabase.auth.admin.getUserById(userId);
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

async function findAuthUserByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  let page = 1;
  while (page < 20) {
    const { data, error } = await serviceSupabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => String(user.email || "").trim().toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureOwnerMembership(category) {
  if (!category?.id || !category?.user_id) return null;
  const owner = await getAuthUserById(category.user_id);
  const payload = {
    category_id: category.id,
    user_id: category.user_id,
    role: "owner",
    added_by: category.user_id,
    email_snapshot: owner?.email || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await serviceSupabase
    .from("project_memberships")
    .upsert(payload, { onConflict: "category_id,user_id" });
  if (error) throw error;
  return payload;
}

async function getCategoryById(categoryId) {
  const { data, error } = await serviceSupabase
    .from("categories")
    .select("id, name, user_id, subcategories(id, name)")
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getMembership(categoryId, userId) {
  const { data, error } = await serviceSupabase
    .from("project_memberships")
    .select("category_id, user_id, role, email_snapshot, created_at, updated_at")
    .eq("category_id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getProjectAccess(userId, categoryId) {
  const category = await getCategoryById(categoryId);
  if (!category) return null;
  await ensureOwnerMembership(category);
  if (String(category.user_id) === String(userId)) {
    return {
      category,
      role: "owner",
      can_edit: true,
      can_manage_members: true,
      is_owner: true,
      membership: {
        category_id: category.id,
        user_id: userId,
        role: "owner",
      },
    };
  }
  const membership = await getMembership(category.id, userId);
  if (!membership) return null;
  const role = normalizeRole(membership.role);
  return {
    category,
    role,
    can_edit: canEditProjectRole(role),
    can_manage_members: canManageProjectMembers(role),
    is_owner: false,
    membership,
  };
}

async function loadWorkspaceSeedFromOwnerProfile(category) {
  const { data: profileRow, error } = await serviceSupabase
    .from("user_profile")
    .select("profile")
    .eq("user_id", category.user_id)
    .maybeSingle();
  if (error) throw error;
  const profile = profileRow?.profile || {};
  const prefs = profile.preferences || {};
  const legacyLinks = String(prefs.category_project_links?.[String(category.id)] || "");
  const mergedWorkspace = mergeProjectWorkspace(prefs, category.id, legacyLinks);
  const taskOrderIds = Array.isArray(prefs.category_task_order_ids?.[String(category.id)])
    ? prefs.category_task_order_ids[String(category.id)].map((value) => String(value)).filter(Boolean)
    : [];
  return {
    workspace: normalizeWorkspacePayload(mergedWorkspace, legacyLinks),
    legacy_links: legacyLinks,
    task_order_ids: taskOrderIds,
  };
}

export async function ensureSharedProjectWorkspace(categoryId) {
  const category = await getCategoryById(categoryId);
  if (!category) return null;
  const { data: existing, error } = await serviceSupabase
    .from("shared_project_workspaces")
    .select("*")
    .eq("category_id", categoryId)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    return {
      ...existing,
      workspace: normalizeWorkspacePayload(existing.workspace, existing.legacy_links),
      legacy_links: existing.legacy_links || "",
      task_order_ids: Array.isArray(existing.task_order_ids) ? existing.task_order_ids : [],
    };
  }
  const seeded = await loadWorkspaceSeedFromOwnerProfile(category);
  const payload = {
    category_id: category.id,
    owner_user_id: category.user_id,
    workspace: seeded.workspace,
    legacy_links: seeded.legacy_links || "",
    task_order_ids: seeded.task_order_ids || [],
  };
  const { data: created, error: createErr } = await serviceSupabase
    .from("shared_project_workspaces")
    .upsert(payload, { onConflict: "category_id" })
    .select("*")
    .single();
  if (createErr) throw createErr;
  return {
    ...created,
    workspace: normalizeWorkspacePayload(created.workspace, created.legacy_links),
    legacy_links: created.legacy_links || "",
    task_order_ids: Array.isArray(created.task_order_ids) ? created.task_order_ids : [],
  };
}

export async function listProjectMembers(actorUserId, categoryId) {
  const access = await getProjectAccess(actorUserId, categoryId);
  if (!access) {
    const err = new Error("Project not found.");
    err.status = 404;
    throw err;
  }
  const { data, error } = await serviceSupabase
    .from("project_memberships")
    .select("category_id, user_id, role, email_snapshot, created_at, updated_at")
    .eq("category_id", categoryId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).sort((a, b) => {
    const ra = a.role === "owner" ? 0 : a.role === "editor" ? 1 : 2;
    const rb = b.role === "owner" ? 0 : b.role === "editor" ? 1 : 2;
    if (ra !== rb) return ra - rb;
    return String(a.email_snapshot || "").localeCompare(String(b.email_snapshot || ""));
  });
}

async function fetchMemberRows(categoryIds) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return [];
  const { data, error } = await serviceSupabase
    .from("project_memberships")
    .select("category_id, user_id, role, email_snapshot")
    .in("category_id", categoryIds);
  if (error) throw error;
  return data || [];
}

function buildMemberPreview(memberRows, categoryId) {
  const rows = memberRows.filter((row) => String(row.category_id) === String(categoryId));
  return {
    count: rows.length,
    all: rows.map((row) => ({
      user_id: row.user_id,
      role: row.role,
      email: row.email_snapshot || "",
    })),
    members: rows.slice(0, 3).map((row) => ({
      user_id: row.user_id,
      role: row.role,
      email: row.email_snapshot || "",
    })),
  };
}

export async function listAccessibleCategoriesWithMeta(userId) {
  const [
    { data: ownedCategories, error: ownedErr },
    { data: memberships, error: membershipsErr },
  ] = await Promise.all([
    serviceSupabase
      .from("categories")
      .select("id, name, user_id, subcategories(id, name)")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
    serviceSupabase
      .from("project_memberships")
      .select("category_id, user_id, role")
      .eq("user_id", userId),
  ]);
  if (ownedErr) throw ownedErr;
  if (membershipsErr) throw membershipsErr;

  const owned = ownedCategories || [];
  const sharedIds = Array.from(
    new Set(
      (memberships || [])
        .filter((row) => String(row.user_id) === String(userId) && row.role !== "owner")
        .map((row) => row.category_id)
        .filter(Boolean)
    )
  );
  const { data: sharedCategories, error: sharedErr } =
    sharedIds.length > 0
      ? await serviceSupabase
          .from("categories")
          .select("id, name, user_id, subcategories(id, name)")
          .in("id", sharedIds)
          .order("name", { ascending: true })
      : { data: [], error: null };
  if (sharedErr) throw sharedErr;

  const combined = [...owned, ...((sharedCategories || []).filter((row) => String(row.user_id) !== String(userId)))];
  const allIds = combined.map((row) => row.id);
  const memberRows = await fetchMemberRows(allIds);
  const byMembershipCategory = new Map(
    (memberships || []).map((row) => [String(row.category_id), normalizeRole(row.role)])
  );

  return combined
    .map((category) => {
      const role = String(category.user_id) === String(userId)
        ? "owner"
        : byMembershipCategory.get(String(category.id)) || "viewer";
      const preview = buildMemberPreview(memberRows, category.id);
      return {
        ...category,
        _access: {
          role,
          is_owner: role === "owner",
          can_edit: canEditProjectRole(role),
          can_manage_members: canManageProjectMembers(role),
        },
        _memberCount: preview.count,
        _memberPreview: preview.members,
        _members: preview.all,
      };
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function loadAssignmentsForTasks(taskIds) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return [];
  const { data, error } = await serviceSupabase
    .from("task_assignments")
    .select("task_id, user_id, email_snapshot, assigned_by, created_at")
    .in("task_id", taskIds);
  if (error) throw error;
  return data || [];
}

function decorateTasksForActor(tasks, actorUserId, categoryAccessMap, assignmentRows) {
  const assignmentMap = new Map();
  assignmentRows.forEach((row) => {
    const key = String(row.task_id);
    const list = assignmentMap.get(key) || [];
    list.push({
      user_id: row.user_id,
      email: row.email_snapshot || "",
      assigned_by: row.assigned_by || null,
      created_at: row.created_at || null,
    });
    assignmentMap.set(key, list);
  });

  return (tasks || []).map((task) => {
    const access = categoryAccessMap.get(String(task.category_id)) || {
      role: String(task.user_id) === String(actorUserId) ? "owner" : "viewer",
      can_edit: String(task.user_id) === String(actorUserId),
      can_manage_members: false,
      is_owner: String(task.user_id) === String(actorUserId),
    };
    const assignees = assignmentMap.get(String(task.id)) || [];
    const isAssignedToMe = assignees.some((row) => String(row.user_id) === String(actorUserId));
    const isOwnedByMe = String(task.user_id) === String(actorUserId);
    return {
      ...task,
      assignees,
      _ownerUserId: task.user_id,
      _isAssignedToMe: isAssignedToMe,
      _isOwnedByMe: isOwnedByMe,
      _permissions: {
        role: access.role,
        can_edit: !!access.can_edit || isOwnedByMe,
        can_change_status: !!access.can_edit || isOwnedByMe || isAssignedToMe,
        can_assign: !!access.can_edit || isOwnedByMe,
        can_manage_members: !!access.can_manage_members,
      },
    };
  });
}

export async function listBacklogTasksForActor(userId, options = {}) {
  const includeArchived = !!options.includeArchived;
  let ownedTasksQuery = serviceSupabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("user_id", userId);
  if (!includeArchived) ownedTasksQuery = ownedTasksQuery.neq("status", "archived");
  const [
    { data: ownedTasks, error: ownedErr },
    { data: myAssignments, error: assignmentsErr },
  ] = await Promise.all([
    ownedTasksQuery,
    serviceSupabase
      .from("task_assignments")
      .select("task_id")
      .eq("user_id", userId),
  ]);
  if (ownedErr) throw ownedErr;
  if (assignmentsErr) throw assignmentsErr;

  const assignedIds = Array.from(new Set((myAssignments || []).map((row) => row.task_id).filter(Boolean)));
  let assignedTasks = [];
  if (assignedIds.length > 0) {
    let query = serviceSupabase.from("tasks").select(TASK_SELECT).in("id", assignedIds);
    if (!includeArchived) query = query.neq("status", "archived");
    const { data, error } = await query;
    if (error) throw error;
    assignedTasks = data || [];
  }

  const combinedById = new Map();
  [...(ownedTasks || []), ...assignedTasks].forEach((task) => {
    combinedById.set(String(task.id), task);
  });
  const combined = Array.from(combinedById.values());
  const categoryIds = Array.from(new Set(combined.map((task) => task.category_id).filter(Boolean)));
  const categories = await listAccessibleCategoriesWithMeta(userId);
  const categoryAccessMap = new Map(categories.map((category) => [String(category.id), category._access]));
  const assignmentRows = await loadAssignmentsForTasks(combined.map((task) => task.id));
  return decorateTasksForActor(combined, userId, categoryAccessMap, assignmentRows).sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

export async function getProjectPageData(userId, categoryId) {
  const access = await getProjectAccess(userId, categoryId);
  if (!access) {
    const err = new Error("Project not found.");
    err.status = 404;
    throw err;
  }
  const [workspaceRow, members, categories, tasksRes, profileRow] = await Promise.all([
    ensureSharedProjectWorkspace(categoryId),
    listProjectMembers(userId, categoryId),
    listAccessibleCategoriesWithMeta(userId),
    serviceSupabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: true }),
    serviceSupabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (profileRow.error) throw profileRow.error;
  const assignmentRows = await loadAssignmentsForTasks((tasksRes.data || []).map((task) => task.id));
  const categoryAccessMap = new Map(categories.map((category) => [String(category.id), category._access]));
  return {
    category: {
      ...access.category,
      _access: access,
    },
    categories,
    workspace: workspaceRow.workspace,
    legacy_links: workspaceRow.legacy_links || "",
    task_order_ids: Array.isArray(workspaceRow.task_order_ids) ? workspaceRow.task_order_ids : [],
    members,
    profile: profileRow.data?.profile || null,
    tasks: decorateTasksForActor(tasksRes.data || [], userId, categoryAccessMap, assignmentRows),
  };
}

export async function saveSharedProjectWorkspace(userId, categoryId, patch = {}) {
  const access = await getProjectAccess(userId, categoryId);
  if (!access?.can_edit) {
    const err = new Error("You do not have permission to edit this project.");
    err.status = 403;
    throw err;
  }
  const current = await ensureSharedProjectWorkspace(categoryId);
  const nextSuggestedMoves = Array.isArray(patch.suggested_moves)
    ? patch.suggested_moves
    : patch.append_suggested_move
    ? Array.from(
        new Set([...(current.workspace?.suggested_moves || []), String(patch.append_suggested_move || "").trim()].filter(Boolean))
      )
    : undefined;
  const nextWorkspace = normalizeWorkspacePayload(
    {
      ...current.workspace,
      ...(patch.mantra !== undefined ? { mantra: patch.mantra } : {}),
      ...(patch.narrative !== undefined ? { narrative: patch.narrative } : {}),
      ...(patch.efficiency_tip !== undefined ? { efficiency_tip: patch.efficiency_tip } : {}),
      ...(nextSuggestedMoves !== undefined ? { suggested_moves: nextSuggestedMoves } : {}),
      ...(Array.isArray(patch.resources) ? { resources: patch.resources } : {}),
      ...(patch.health_needs ? { health_needs: { ...current.workspace.health_needs, ...patch.health_needs } } : {}),
    },
    patch.legacy_links !== undefined ? patch.legacy_links : current.legacy_links
  );
  const payload = {
    category_id: categoryId,
    owner_user_id: access.category.user_id,
    workspace: nextWorkspace,
    legacy_links: patch.legacy_links !== undefined ? String(patch.legacy_links || "") : current.legacy_links || "",
    task_order_ids:
      patch.task_order_ids !== undefined
        ? (Array.isArray(patch.task_order_ids) ? patch.task_order_ids.map((value) => String(value)).filter(Boolean) : [])
        : (current.task_order_ids || []),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await serviceSupabase
    .from("shared_project_workspaces")
    .upsert(payload, { onConflict: "category_id" })
    .select("*")
    .single();
  if (error) throw error;
  return {
    ...data,
    workspace: normalizeWorkspacePayload(data.workspace, data.legacy_links),
  };
}

async function getTaskRow(taskId) {
  const { data, error } = await serviceSupabase
    .from("tasks")
    .select(
      "id, user_id, title, status, priority, effort_hours, due_date, category_id, subcategory_id, parent_task_id, outcome_ids, primary_life_domain, life_domains, alignment_source"
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getTaskEditContext(actorUserId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task) {
    const err = new Error("Task not found.");
    err.status = 404;
    throw err;
  }
  const access = await getProjectAccess(actorUserId, task.category_id);
  const assignmentRows = await loadAssignmentsForTasks([task.id]);
  const isAssignedToMe = assignmentRows.some((row) => String(row.user_id) === String(actorUserId));
  return {
    task,
    access,
    can_edit: String(task.user_id) === String(actorUserId) || !!access?.can_edit,
    can_change_status:
      String(task.user_id) === String(actorUserId) || !!access?.can_edit || isAssignedToMe,
    is_assigned_to_me: isAssignedToMe,
  };
}

export async function updateTaskCollaborative(actorUserId, taskId, updates) {
  const ctx = await getTaskEditContext(actorUserId, taskId);
  if (!ctx.can_edit) {
    const err = new Error("You do not have permission to edit this task.");
    err.status = 403;
    throw err;
  }
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
    outcome_ids:
      updates.outcome_ids !== undefined ? (Array.isArray(updates.outcome_ids) ? updates.outcome_ids : []) : undefined,
    primary_life_domain:
      updates.primary_life_domain !== undefined ? updates.primary_life_domain || null : undefined,
    life_domains:
      updates.life_domains !== undefined ? (Array.isArray(updates.life_domains) ? updates.life_domains : []) : undefined,
    alignment_source:
      updates.alignment_source !== undefined ? updates.alignment_source || null : undefined,
  };
  Object.keys(allowed).forEach((key) => {
    if (allowed[key] === undefined) delete allowed[key];
  });
  const { data, error } = await serviceSupabase
    .from("tasks")
    .update(allowed)
    .eq("id", taskId)
    .eq("user_id", ctx.task.user_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskStatusCollaborative(actorUserId, taskId, nextStatus) {
  const ctx = await getTaskEditContext(actorUserId, taskId);
  if (!ctx.can_change_status) {
    const err = new Error("You do not have permission to update this task.");
    err.status = 403;
    throw err;
  }
  const { data, error } = await serviceSupabase
    .from("tasks")
    .update({
      status: nextStatus,
      archived_at: nextStatus === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("user_id", ctx.task.user_id)
    .select("*")
    .single();
  if (error) throw error;
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
  const { error: eventErr } = await serviceSupabase.from("task_events").insert({
    user_id: ctx.task.user_id,
    actor_user_id: actorUserId,
    task_id: taskId,
    event_type: eventType,
  });
  if (eventErr) throw eventErr;
  return data;
}

export async function setTaskTagsCollaborative(actorUserId, taskId, tagNames) {
  const ctx = await getTaskEditContext(actorUserId, taskId);
  if (!ctx.can_edit) {
    const err = new Error("You do not have permission to edit tags on this task.");
    err.status = 403;
    throw err;
  }
  const ownerUserId = ctx.task.user_id;
  const names = Array.from(
    new Set(
      (tagNames || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  if (names.length === 0) {
    const { error } = await serviceSupabase
      .from("task_tags")
      .delete()
      .eq("user_id", ownerUserId)
      .eq("task_id", taskId);
    if (error) throw error;
    return null;
  }
  const tagIds = [];
  for (const name of names) {
    const { data: existing, error: existingErr } = await serviceSupabase
      .from("tags")
      .select("id")
      .eq("user_id", ownerUserId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.id) {
      tagIds.push(existing.id);
      continue;
    }
    const { data: created, error: createErr } = await serviceSupabase
      .from("tags")
      .insert({ user_id: ownerUserId, name })
      .select("id")
      .single();
    if (createErr) throw createErr;
    tagIds.push(created.id);
  }
  const { error: clearErr } = await serviceSupabase
    .from("task_tags")
    .delete()
    .eq("user_id", ownerUserId)
    .eq("task_id", taskId);
  if (clearErr) throw clearErr;
  const { error: insertErr } = await serviceSupabase.from("task_tags").insert(
    tagIds.map((tagId) => ({
      user_id: ownerUserId,
      task_id: taskId,
      tag_id: tagId,
    }))
  );
  if (insertErr) throw insertErr;
  return null;
}

export async function ensureSubcategoryCollaborative(actorUserId, categoryId, name) {
  const access = await getProjectAccess(actorUserId, categoryId);
  if (!access?.can_edit) {
    const err = new Error("You do not have permission to edit this project.");
    err.status = 403;
    throw err;
  }
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const { data: existing, error: existingErr } = await serviceSupabase
    .from("subcategories")
    .select("id, name")
    .eq("category_id", categoryId)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return existing;
  const { data, error } = await serviceSupabase
    .from("subcategories")
    .insert({
      user_id: access.category.user_id,
      category_id: categoryId,
      name: trimmed,
    })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function createTaskCollaborative(actorUserId, payload) {
  const categoryId = payload.category_id || null;
  if (!categoryId) {
    const err = new Error("Category is required.");
    err.status = 400;
    throw err;
  }
  const access = await getProjectAccess(actorUserId, categoryId);
  if (!access?.can_edit) {
    const err = new Error("You do not have permission to create tasks in this project.");
    err.status = 403;
    throw err;
  }
  const row = {
    user_id: access.category.user_id,
    title: payload.title,
    status: payload.status || "todo",
    priority: payload.priority || "Medium",
    effort_hours: payload.effort_hours ?? null,
    due_date: payload.due_date ?? null,
    parent_task_id: payload.parent_task_id ?? null,
    category_id: categoryId,
    subcategory_id: payload.subcategory_id ?? null,
    outcome_ids: Array.isArray(payload.outcome_ids) ? payload.outcome_ids : [],
    primary_life_domain: payload.primary_life_domain || null,
    life_domains: Array.isArray(payload.life_domains) ? payload.life_domains : [],
    alignment_source: payload.alignment_source || null,
  };
  const { data, error } = await serviceSupabase
    .from("tasks")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function replaceTaskAssignee(actorUserId, taskId, assigneeUserId) {
  const ctx = await getTaskEditContext(actorUserId, taskId);
  if (!ctx.can_edit) {
    const err = new Error("You do not have permission to assign this task.");
    err.status = 403;
    throw err;
  }
  const { error: clearErr } = await serviceSupabase.from("task_assignments").delete().eq("task_id", taskId);
  if (clearErr) throw clearErr;
  if (!assigneeUserId) return [];
  const assigneeAccess = await getProjectAccess(assigneeUserId, ctx.task.category_id);
  if (!assigneeAccess) {
    const err = new Error("Selected user must be a project member first.");
    err.status = 400;
    throw err;
  }
  const assigneeUser = await getAuthUserById(assigneeUserId);
  const { data, error } = await serviceSupabase
    .from("task_assignments")
    .insert({
      task_id: taskId,
      user_id: assigneeUserId,
      assigned_by: actorUserId,
      email_snapshot: assigneeUser?.email || null,
    })
    .select("task_id, user_id, email_snapshot, assigned_by, created_at");
  if (error) throw error;
  return data || [];
}

export async function addProjectMemberByEmail(actorUserId, categoryId, email, role) {
  const access = await getProjectAccess(actorUserId, categoryId);
  if (!access?.can_manage_members) {
    const err = new Error("Only the project owner can manage members.");
    err.status = 403;
    throw err;
  }
  const user = await findAuthUserByEmail(email);
  if (!user?.id) {
    const err = new Error("No account found for that email yet.");
    err.status = 404;
    throw err;
  }
  if (String(user.id) === String(access.category.user_id)) {
    return listProjectMembers(actorUserId, categoryId);
  }
  const { error } = await serviceSupabase
    .from("project_memberships")
    .upsert(
      {
        category_id: categoryId,
        user_id: user.id,
        role: normalizeRole(role),
        added_by: actorUserId,
        email_snapshot: user.email || email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category_id,user_id" }
    );
  if (error) throw error;
  return listProjectMembers(actorUserId, categoryId);
}

export async function updateProjectMemberRole(actorUserId, categoryId, memberUserId, role) {
  const access = await getProjectAccess(actorUserId, categoryId);
  if (!access?.can_manage_members) {
    const err = new Error("Only the project owner can manage members.");
    err.status = 403;
    throw err;
  }
  if (String(memberUserId) === String(access.category.user_id)) {
    const err = new Error("Owner role cannot be changed.");
    err.status = 400;
    throw err;
  }
  const { error } = await serviceSupabase
    .from("project_memberships")
    .update({ role: normalizeRole(role), updated_at: new Date().toISOString() })
    .eq("category_id", categoryId)
    .eq("user_id", memberUserId);
  if (error) throw error;
  return listProjectMembers(actorUserId, categoryId);
}

export async function removeProjectMember(actorUserId, categoryId, memberUserId) {
  const access = await getProjectAccess(actorUserId, categoryId);
  if (!access?.can_manage_members) {
    const err = new Error("Only the project owner can manage members.");
    err.status = 403;
    throw err;
  }
  if (String(memberUserId) === String(access.category.user_id)) {
    const err = new Error("Owner cannot be removed.");
    err.status = 400;
    throw err;
  }
  const { error } = await serviceSupabase
    .from("project_memberships")
    .delete()
    .eq("category_id", categoryId)
    .eq("user_id", memberUserId);
  if (error) throw error;
  const { data: categoryTasks, error: tasksErr } = await serviceSupabase
    .from("tasks")
    .select("id")
    .eq("category_id", categoryId);
  if (tasksErr) throw tasksErr;
  const taskIds = (categoryTasks || []).map((row) => row.id).filter(Boolean);
  if (taskIds.length > 0) {
    const { error: clearAssignmentsErr } = await serviceSupabase
      .from("task_assignments")
      .delete()
      .in("task_id", taskIds)
      .eq("user_id", memberUserId);
    if (clearAssignmentsErr) throw clearAssignmentsErr;
  }
  return listProjectMembers(actorUserId, categoryId);
}

export async function getVisibleTaskTagSuggestions(actorUserId, taskIds = []) {
  const tasks = taskIds.length > 0
    ? (
        await serviceSupabase
          .from("tasks")
          .select("id, user_id")
          .in("id", taskIds)
      ).data || []
    : [];
  const ownerIds = Array.from(new Set(tasks.map((task) => task.user_id).filter(Boolean).concat(actorUserId)));
  const { data, error } = await serviceSupabase
    .from("tags")
    .select("id, name, color, user_id")
    .in("user_id", ownerIds)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export { serviceSupabase };
