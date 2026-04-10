import { supabase } from "./supabaseClient";

async function getAccessToken() {
  let { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData?.session?.access_token;
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed?.session?.access_token;
    sessionData = refreshed;
  }
  if (!token) {
    throw new Error("Auth session missing. Please refresh and sign in again.");
  }
  return token;
}

async function authedJson(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw_text: text };
  }
  if (!response.ok) {
    throw new Error(data?.error || data?.raw_text || `Request failed (${response.status})`);
  }
  return data;
}

export function loadCollaborativeProjects() {
  return authedJson("/api/collab/projects");
}

export function loadCollaborativeBacklog(includeArchived = true) {
  const q = includeArchived ? "?include_archived=1" : "";
  return authedJson(`/api/collab/backlog${q}`);
}

export function loadCollaborativeProject(categoryId) {
  return authedJson(`/api/collab/projects/${categoryId}`);
}

export function loadWorkspaceOrders() {
  return authedJson("/api/collab/workspace-orders");
}

export function saveCollaborativeProjectWorkspace(categoryId, payload) {
  return authedJson(`/api/collab/projects/${categoryId}`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function listCollaborativeProjectMembers(categoryId) {
  return authedJson(`/api/collab/projects/${categoryId}/members`);
}

export function addCollaborativeProjectMember(categoryId, email, role) {
  return authedJson(`/api/collab/projects/${categoryId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function updateCollaborativeProjectMember(categoryId, memberUserId, role) {
  return authedJson(`/api/collab/projects/${categoryId}/members`, {
    method: "PATCH",
    body: JSON.stringify({ member_user_id: memberUserId, role }),
  });
}

export function removeCollaborativeProjectMember(categoryId, memberUserId) {
  return authedJson(`/api/collab/projects/${categoryId}/members`, {
    method: "DELETE",
    body: JSON.stringify({ member_user_id: memberUserId }),
  });
}

export function updateCollaborativeTask(taskId, patch) {
  return authedJson("/api/collab/tasks/update", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, patch }),
  });
}

export function updateCollaborativeTaskStatus(taskId, status) {
  return authedJson("/api/collab/tasks/status", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, status }),
  });
}

export function setCollaborativeTaskTags(taskId, tags) {
  return authedJson("/api/collab/tasks/tags", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, tags }),
  });
}

export function createCollaborativeTask(payload) {
  return authedJson("/api/collab/tasks/create", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function ensureCollaborativeSubcategory(categoryId, name) {
  return authedJson("/api/collab/subcategories", {
    method: "POST",
    body: JSON.stringify({ category_id: categoryId, name }),
  });
}

export function assignCollaborativeTask(taskId, assigneeUserId) {
  return authedJson("/api/collab/tasks/assign", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, assignee_user_id: assigneeUserId || null }),
  });
}

export function toggleCollaborativeTaskCompletion(taskId, nextCompleted) {
  return authedJson("/api/collab/tasks/toggle-complete", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, completed: !!nextCompleted }),
  });
}

export function refillCollaborativePlan(payload) {
  return authedJson("/api/plan/refill", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
