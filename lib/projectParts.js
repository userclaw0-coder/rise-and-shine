// lib/projectParts.js — Project Parts inventory API.
//
// Public functions:
//   addPart(userId, payload)         — insert one part row
//   updatePart(userId, id, patch)    — partial update; only allowed fields
//   getPart(userId, id)              — single read
//   listParts(userId, opts)          — filtered list (category/status/workstream/location)
//   searchParts(userId, opts)        — text search over name + notes + spec.text
//   markInstalled(userId, id, at?)   — convenience: status -> installed + installed_at
//   markOrdered(userId, id, at?)     — convenience: status -> ordered + ordered_at
//   linkPartToTask(userId, taskId, partId, role?)  — add to task_parts
//   unlinkPartFromTask(userId, taskId, partId)     — remove from task_parts
//   listPartsForTask(userId, taskId) — parts linked to a given task
//   listTasksForPart(userId, partId) — tasks linked to a given part
//
// Service-role client used throughout so server routes / Jarvis tools / MCP
// can run without a user JWT. Authorization is enforced by user_id filter
// on every query (matches the pattern in lib/memories.js).

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STATUSES = [
  "on_hand",
  "installed",
  "ordered",
  "planned",
  "missing",
  "retired",
];
const LINK_ROLES = ["installs", "consumes", "configures", "references"];

// --- helpers -----------------------------------------------------------

function normalizePartInsert(p) {
  if (!p || typeof p !== "object") throw new Error("part must be an object");
  if (!p.category_id) throw new Error("category_id required");
  if (!p.name || typeof p.name !== "string") throw new Error("name required");
  const status = p.status || "on_hand";
  if (!STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
  const qty = p.qty == null ? 1 : Number(p.qty);
  if (!Number.isFinite(qty) || qty < 0) throw new Error("qty must be >= 0");
  return {
    category_id: p.category_id,
    name: p.name.trim(),
    part_number: p.part_number?.trim() || null,
    manufacturer: p.manufacturer?.trim() || null,
    qty,
    status,
    location: p.location?.trim() || null,
    workstream: p.workstream?.trim() || null,
    spec: p.spec && typeof p.spec === "object" ? p.spec : {},
    notes: p.notes?.trim() || null,
    photos: Array.isArray(p.photos) ? p.photos : [],
    source_ref: p.source_ref?.trim() || null,
    ordered_at: p.ordered_at || null,
    installed_at: p.installed_at || null,
  };
}

function normalizePartPatch(patch) {
  const allowed = {};
  if (patch.name !== undefined) allowed.name = String(patch.name).trim();
  if (patch.part_number !== undefined)
    allowed.part_number = patch.part_number?.trim() || null;
  if (patch.manufacturer !== undefined)
    allowed.manufacturer = patch.manufacturer?.trim() || null;
  if (patch.qty !== undefined) {
    const q = Number(patch.qty);
    if (!Number.isFinite(q) || q < 0) throw new Error("qty must be >= 0");
    allowed.qty = q;
  }
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status))
      throw new Error(`invalid status: ${patch.status}`);
    allowed.status = patch.status;
  }
  if (patch.location !== undefined)
    allowed.location = patch.location?.trim() || null;
  if (patch.workstream !== undefined)
    allowed.workstream = patch.workstream?.trim() || null;
  if (patch.spec !== undefined)
    allowed.spec = patch.spec && typeof patch.spec === "object" ? patch.spec : {};
  if (patch.notes !== undefined) allowed.notes = patch.notes?.trim() || null;
  if (patch.photos !== undefined)
    allowed.photos = Array.isArray(patch.photos) ? patch.photos : [];
  if (patch.source_ref !== undefined)
    allowed.source_ref = patch.source_ref?.trim() || null;
  if (patch.ordered_at !== undefined) allowed.ordered_at = patch.ordered_at;
  if (patch.installed_at !== undefined)
    allowed.installed_at = patch.installed_at;
  return allowed;
}

// --- core CRUD ---------------------------------------------------------

export async function addPart(userId, payload) {
  if (!userId) throw new Error("userId required");
  const row = { user_id: userId, ...normalizePartInsert(payload) };
  const { data, error } = await supabaseAdmin
    .from("project_parts")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updatePart(userId, id, patch) {
  if (!userId) throw new Error("userId required");
  if (!id) throw new Error("id required");
  const allowed = normalizePartPatch(patch || {});
  if (Object.keys(allowed).length === 0) {
    // Nothing to update; return current.
    return getPart(userId, id);
  }
  const { data, error } = await supabaseAdmin
    .from("project_parts")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getPart(userId, id) {
  const { data, error } = await supabaseAdmin
    .from("project_parts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listParts(userId, opts = {}) {
  let q = supabaseAdmin
    .from("project_parts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (opts.category_id) q = q.eq("category_id", opts.category_id);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.workstream) q = q.eq("workstream", opts.workstream);
  if (opts.location) q = q.eq("location", opts.location);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function searchParts(userId, opts = {}) {
  // Text search over name + notes via ilike. Cheap and good enough for v1.
  const query = (opts.query || "").trim();
  let q = supabaseAdmin
    .from("project_parts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (opts.category_id) q = q.eq("category_id", opts.category_id);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.workstream) q = q.eq("workstream", opts.workstream);
  if (query) {
    const escaped = query.replace(/[%_]/g, "\\$&");
    q = q.or(
      `name.ilike.%${escaped}%,notes.ilike.%${escaped}%,part_number.ilike.%${escaped}%,manufacturer.ilike.%${escaped}%`
    );
  }
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function deletePart(userId, id) {
  const { error } = await supabaseAdmin
    .from("project_parts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

// --- status conveniences -----------------------------------------------

export async function markInstalled(userId, id, at = null) {
  return updatePart(userId, id, {
    status: "installed",
    installed_at: at || new Date().toISOString(),
  });
}

export async function markOrdered(userId, id, at = null) {
  return updatePart(userId, id, {
    status: "ordered",
    ordered_at: at || new Date().toISOString(),
  });
}

// --- task <-> part linking ---------------------------------------------

export async function linkPartToTask(userId, taskId, partId, role = "installs") {
  if (!LINK_ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  const { data, error } = await supabaseAdmin
    .from("task_parts")
    .upsert(
      { user_id: userId, task_id: taskId, part_id: partId, role },
      { onConflict: "task_id,part_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function unlinkPartFromTask(userId, taskId, partId) {
  const { error } = await supabaseAdmin
    .from("task_parts")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("part_id", partId);
  if (error) throw error;
  return { ok: true };
}

export async function listPartsForTask(userId, taskId) {
  const { data, error } = await supabaseAdmin
    .from("task_parts")
    .select("role, part:project_parts (*)")
    .eq("user_id", userId)
    .eq("task_id", taskId);
  if (error) throw error;
  return (data || []).map((r) => ({ ...r.part, link_role: r.role }));
}

export async function listTasksForPart(userId, partId) {
  const { data, error } = await supabaseAdmin
    .from("task_parts")
    .select("role, task:tasks (id, title, status, phase)")
    .eq("user_id", userId)
    .eq("part_id", partId);
  if (error) throw error;
  return (data || []).map((r) => ({ ...r.task, link_role: r.role }));
}

export const PART_STATUSES = STATUSES;
export const PART_LINK_ROLES = LINK_ROLES;
