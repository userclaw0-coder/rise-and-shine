export function normalizeTag(tag) {
  if (!tag) return "";
  return String(tag).trim().toLowerCase().replace(/\s+/g, "-");
}

export function hasBlockedOrWaitingTag(task) {
  const tags = (task?.tags || [])
    .map((t) => {
      if (!t) return "";
      if (typeof t === "string") return normalizeTag(t);
      if (t.name) return normalizeTag(t.name);
      if (t.tag?.name) return normalizeTag(t.tag.name);
      return "";
    })
    .filter(Boolean);
  const set = new Set(tags);
  return set.has("blocked") || set.has("waiting");
}

/** Build queue payload for daily_plans from chosen outcomes (slot/type/task_id). */
export function buildQueueFromChosen(chosen) {
  const types = ["Quick Win", "High Leverage", "Progress"];
  return (chosen || []).slice(0, 3).map((entry, idx) => ({
    slot: idx + 1,
    type: types[idx] || "Progress",
    task_id: entry.task.id,
  }));
}

export function buildQueueCandidates(tasks, dailyTemplateTaskIds = []) {
  const dailySet = new Set(dailyTemplateTaskIds || []);
  return (tasks || []).filter((t) => {
    const catName =
      typeof t.category === "string"
        ? t.category
        : t.category?.name ?? null;
    if (catName === "Daily Repeat") return false;
    if (dailySet.has(t.id)) return false;
    if (hasBlockedOrWaitingTag(t)) return false;
    return t.status === "todo" || t.status === "doing";
  });
}

/**
 * Build an updated queue array with a subtask promoted into the parent's slot.
 * Returns a new queue array (for daily_plans.queue) or null if no swap occurred.
 */
export function promoteSubtaskToQueue(currentQueue, parentTaskId, subtaskId) {
  if (!Array.isArray(currentQueue) || !parentTaskId || !subtaskId) return null;
  const idx = currentQueue.findIndex((slot) => slot.task_id === parentTaskId);
  if (idx === -1) return null;
  const updated = currentQueue.map((slot, i) =>
    i === idx ? { ...slot, task_id: subtaskId } : slot
  );
  return updated;
}

export function shouldRefillAfterCompletion({
  taskId,
  wasCompleted,
  queueTaskIds,
  completionMap,
}) {
  if (wasCompleted) return false;
  if (!taskId) return false;
  if (!Array.isArray(queueTaskIds) || queueTaskIds.length !== 3) return false;
  if (!queueTaskIds.includes(taskId)) return false;
  return queueTaskIds.every((id) => !!completionMap[id]);
}
