export function normalizeTagName(name) {
  return String(name || "").trim();
}

export function buildPlannerTaskUpdates({ suggested_title, suggested_effort_minutes } = {}) {
  const updates = {};

  if (typeof suggested_title === "string" && suggested_title.trim()) {
    updates.title = suggested_title.trim();
  }

  if (
    suggested_effort_minutes !== undefined &&
    suggested_effort_minutes !== null &&
    Number.isFinite(Number(suggested_effort_minutes))
  ) {
    const hours = Number(suggested_effort_minutes) / 60;
    updates.effort_hours = Math.max(0, Number(hours.toFixed(2)));
  }

  return updates;
}

export function normalizeIncomingTags(suggested_tags_add) {
  if (!Array.isArray(suggested_tags_add)) return [];
  return Array.from(new Set(suggested_tags_add.map(normalizeTagName).filter(Boolean)));
}

export function mergePlannerTagNames(existingTagNames = [], incomingTagNames = []) {
  const desired = [];
  const seen = new Set();

  for (const name of existingTagNames.map(normalizeTagName).filter(Boolean)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    desired.push(name);
  }

  for (const name of incomingTagNames.map(normalizeTagName).filter(Boolean)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    desired.push(name);
  }

  return desired;
}
