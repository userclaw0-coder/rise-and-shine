const EFFORT_BUCKETS = ["XS", "S", "M", "L"];

export const ENRICHMENT_TAGS = [
  "quick-win",
  "high-leverage",
  "urgent",
  "blocked",
  "waiting",
];

export function normalizeTagName(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function normalizePriority(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "critical") return "Critical";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return null;
}

export function normalizeEffortBucket(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (EFFORT_BUCKETS.includes(normalized)) return normalized;
  return null;
}

export function bucketToHours(bucket) {
  switch (bucket) {
    case "XS":
      return 0.25;
    case "S":
      return 0.5;
    case "M":
      return 1.5;
    case "L":
      return 3;
    default:
      return null;
  }
}

export function normalizeTagList(values) {
  const unique = new Set();
  for (const value of values || []) {
    const normalized = normalizeTagName(value);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

function inferDueDateUrgency(dueDate, now = new Date()) {
  if (!dueDate) return false;
  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return false;
  const hours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hours <= 48;
}

function inferBlockedOrWaiting(title, tags) {
  const text = String(title || "").toLowerCase();
  const normalizedTags = new Set(normalizeTagList(tags));

  const blockedSignals = ["blocked", "stuck", "cannot", "can't", "dependency", "waiting on"];
  if (normalizedTags.has("blocked") || blockedSignals.some((s) => text.includes(s))) {
    return "blocked";
  }

  const waitingSignals = ["waiting", "await", "follow up", "pending", "reply"];
  if (normalizedTags.has("waiting") || waitingSignals.some((s) => text.includes(s))) {
    return "waiting";
  }

  return null;
}

export function isMissingPrioritizationMetadata(task) {
  const hasPriority = !!normalizePriority(task?.priority);
  const hasEffort = typeof task?.effort_hours === "number" && task.effort_hours > 0;
  const tags = normalizeTagList(task?.tags || []);
  const hasSignalTag = tags.some((t) => ENRICHMENT_TAGS.includes(t));
  return !hasPriority || !hasEffort || !hasSignalTag;
}

export function buildHeuristicEnrichment(task, now = new Date()) {
  const existingTags = normalizeTagList(task?.tags || []);

  const blockedOrWaiting = inferBlockedOrWaiting(task?.title, existingTags);
  const dueSoon = inferDueDateUrgency(task?.due_date, now);

  let priority = normalizePriority(task?.priority);
  if (!priority) {
    if (blockedOrWaiting === "blocked") priority = "High";
    else if (dueSoon) priority = "High";
    else priority = "Medium";
  }

  let effortBucket = null;
  const existingEffort = typeof task?.effort_hours === "number" ? task.effort_hours : null;
  if (existingEffort != null && existingEffort > 0) {
    if (existingEffort <= 0.25) effortBucket = "XS";
    else if (existingEffort <= 0.75) effortBucket = "S";
    else if (existingEffort <= 2) effortBucket = "M";
    else effortBucket = "L";
  } else {
    effortBucket = dueSoon ? "S" : "M";
  }

  const tagsToAdd = [];
  if (blockedOrWaiting) tagsToAdd.push(blockedOrWaiting);
  if (dueSoon && blockedOrWaiting !== "waiting") tagsToAdd.push("urgent");
  if (effortBucket === "XS" || effortBucket === "S") tagsToAdd.push("quick-win");
  if (/strategy|plan|deal|system|automation|pipeline|revenue|acquisition/i.test(String(task?.title || ""))) {
    tagsToAdd.push("high-leverage");
  }

  return {
    priority,
    effort_bucket: effortBucket,
    tags_add: normalizeTagList(tagsToAdd).filter((t) => ENRICHMENT_TAGS.includes(t)),
    rationale:
      blockedOrWaiting
        ? `Heuristic: dependency signal detected (${blockedOrWaiting}).`
        : dueSoon
          ? "Heuristic: due date is within 48 hours."
          : "Heuristic: defaulted from baseline urgency/effort assumptions.",
    source: "heuristic",
  };
}

export function sanitizeAiEnrichment(raw, task, options = {}) {
  const priority = normalizePriority(raw?.priority) || null;
  const effortBucket = normalizeEffortBucket(raw?.effort_bucket);
  const tagsAdd = normalizeTagList(raw?.tags_add || []).filter((t) => ENRICHMENT_TAGS.includes(t));
  const allowedOutcomeIds = options.allowedOutcomeIds || [];
  const outcomeIds = Array.isArray(raw?.outcome_ids)
    ? raw.outcome_ids.filter((id) => id && allowedOutcomeIds.includes(String(id)))
    : [];
  const primaryLifeDomain = sanitizePrimaryLifeDomain(raw?.primary_life_domain);

  return {
    task_id: task.id,
    priority,
    effort_bucket: effortBucket,
    tags_add: tagsAdd,
    outcome_ids: outcomeIds,
    primary_life_domain: primaryLifeDomain,
    rationale: typeof raw?.rationale === "string" ? raw.rationale.slice(0, 280) : null,
    source: "ai",
  };
}

export function mergeTagNames(existing, additions) {
  const out = new Set(normalizeTagList(existing || []));
  for (const add of normalizeTagList(additions || [])) out.add(add);
  return Array.from(out);
}

const LIFE_DOMAIN_KEYS = ["business", "finances", "health", "relationships", "lifestyle", "growth"];

export function sanitizeOutcomeIds(value, allowedIds) {
  if (!Array.isArray(allowedIds) || allowedIds.length === 0) return [];
  const set = new Set(allowedIds);
  const raw = Array.isArray(value) ? value : [];
  return raw.filter((id) => id && set.has(String(id)));
}

export function sanitizePrimaryLifeDomain(value) {
  if (!value || typeof value !== "string") return null;
  const key = String(value).trim().toLowerCase();
  return LIFE_DOMAIN_KEYS.includes(key) ? key : null;
}

export function computeTaskPatch(task, enrichment, options = {}) {
  const patch = {};
  const effortHoursFromBucket = bucketToHours(enrichment?.effort_bucket);

  if (!normalizePriority(task?.priority) && enrichment?.priority) {
    patch.priority = enrichment.priority;
  }

  if ((task?.effort_hours == null || task.effort_hours <= 0) && effortHoursFromBucket != null) {
    patch.effort_hours = effortHoursFromBucket;
  }

  if (enrichment?.outcome_ids !== undefined && options.allowedOutcomeIds) {
    const ids = sanitizeOutcomeIds(enrichment.outcome_ids, options.allowedOutcomeIds);
    patch.outcome_ids = ids;
  }
  if (enrichment?.primary_life_domain !== undefined) {
    const domain = sanitizePrimaryLifeDomain(enrichment.primary_life_domain);
    patch.primary_life_domain = domain;
  }
  if (enrichment?.outcome_ids !== undefined || enrichment?.primary_life_domain !== undefined) {
    patch.alignment_source = "ai";
  }

  return patch;
}
