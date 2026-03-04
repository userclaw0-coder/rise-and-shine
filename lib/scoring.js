// Shared scoring configuration and helpers for key outcome selection
// Single source of truth for:
// - mode weights
// - scoring algorithm for daily key outcomes

export const TIMEZONE = "America/New_York";

export const BASE_CATEGORY_WEIGHTS = {
  Business: 5,
  "Rental House": 4,
  Vehicles: 3,
  Home: 2,
  Boat: 1,
};

// Mode-specific adjustments are additive on top of base weights.
// Values are small integers so that category still matters more than mode.
export const MODE_ADJUSTMENTS = {
  "Strategic Push": {
    Business: 2,
    "Rental House": 1,
  },
  "Build & Physical": {
    "Rental House": 1,
    Vehicles: 1,
    Boat: 1,
  },
  "Deep Cognitive": {
    Business: 2,
  },
  Maintenance: {
    Vehicles: 2,
    Home: 1,
  },
  "Light / Reset": {
    Home: 2,
  },
  Custom: {},
};

export const MODES = Object.keys(MODE_ADJUSTMENTS);

export const DAILY_KEY_OUTCOMES_COUNT = 3;

// Workout cycle configuration (used by Today + Health/Analytics)
export const WORKOUT_CYCLE_START = "2026-02-16";
export const WORKOUT_PATTERN = ["Strength", "Recovery", "Sprints", "Recovery"];

export const WORKOUT_TASKS = {
  Strength: {
    id: "workout-strength",
    title: "Workout: Strength (5:00 AM)",
    priority: "High",
    tags: ["workout", "strength"],
  },
  Sprints: {
    id: "workout-sprints",
    title: "Workout: Sprints (5:00 AM)",
    priority: "High",
    tags: ["workout", "sprints"],
  },
  Recovery: {
    id: "workout-recovery",
    title: "Workout: Recovery / Mobility (5:00 AM)",
    priority: "Medium",
    tags: ["workout", "recovery"],
  },
};

// Helper to normalize tag strings (case / spacing)
function normalizeTag(tag) {
  if (!tag) return "";
  return String(tag).trim().toLowerCase().replace(/\s+/g, "-");
}

function extractTagNames(task) {
  // task.tags may be:
  // - string[]
  // - [{ name }] from joined tags table
  // - [{ tag: { name } }] from nested join
  const result = [];
  if (!task || !task.tags) return result;

  for (const t of task.tags) {
    if (!t) continue;
    if (typeof t === "string") {
      result.push(normalizeTag(t));
    } else if (t.name) {
      result.push(normalizeTag(t.name));
    } else if (t.tag && t.tag.name) {
      result.push(normalizeTag(t.tag.name));
    }
  }
  return result;
}

function hasAnyTag(task, names) {
  const wanted = new Set(names.map(normalizeTag));
  const found = extractTagNames(task);
  return found.some((t) => wanted.has(t));
}

function getCategoryName(task) {
  if (!task) return null;
  if (typeof task.category === "string") return task.category;
  if (task.category && typeof task.category.name === "string") {
    return task.category.name;
  }
  if (typeof task.category_name === "string") return task.category_name;
  return null;
}

function priorityWeight(priority) {
  switch (priority) {
    case "Critical":
      return 4;
    case "High":
      return 3;
    case "Medium":
      return 2;
    case "Low":
      return 1;
    default:
      return 1;
  }
}

function hoursEffort(task) {
  if (!task) return null;
  if (typeof task.effort_hours === "number") return task.effort_hours;
  if (typeof task.effort === "number") return task.effort;
  return null;
}

function dueSoonBoost(dueDateStr, todayStr) {
  if (!dueDateStr) return 0;
  const due = new Date(dueDateStr);
  const today = new Date(todayStr);
  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return -5; // slightly penalize overdue items that slipped
  if (diffDays === 0) return 15;
  if (diffDays <= 2) return 10;
  if (diffDays <= 7) return 5;
  return 0;
}

function stalenessBoost(lastCompletedAt, now) {
  if (!lastCompletedAt) {
    // Never completed → strong boost
    return 25;
  }
  const last = new Date(lastCompletedAt);
  const diffDays = Math.max(
    0,
    Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (diffDays <= 1) return 0;
  if (diffDays <= 3) return 5;
  if (diffDays <= 7) return 10;
  if (diffDays <= 30) return 15;
  return 20;
}

// Compute a detailed score breakdown for a single task
export function computeTaskScore(task, options) {
  const {
    mode = "Strategic Push",
    todayStr,
    now = new Date(),
    lastCompletedAt = null,
  } = options || {};

  const categoryName = getCategoryName(task) || "Other";
  const baseCat = BASE_CATEGORY_WEIGHTS[categoryName] ?? 1;
  const modeAdj = (MODE_ADJUSTMENTS[mode] || {})[categoryName] ?? 0;
  const categoryComponent = (baseCat + modeAdj) * 10;

  const prioW = priorityWeight(task.priority);
  const priorityComponent = prioW * 5;

  const eff = hoursEffort(task);
  const quickWinTag = hasAnyTag(task, ["quick-win", "easy-win"]);
  const quickWinEffort = eff != null && eff <= 1;
  const isQuickWin = quickWinTag || quickWinEffort;
  const quickWinComponent = isQuickWin ? 40 : 0;

  const highLev = hasAnyTag(task, [
    "high-leverage",
    "high leverage",
    "high_leverage",
  ]);
  const highLeverageComponent = highLev ? 30 : 0;

  const dueBoost = dueSoonBoost(task.due_date, todayStr);

  const stalenessComponent = stalenessBoost(lastCompletedAt, now);

  const subtaskComponent = task.parent_task_id ? 10 : 0;

  const rawScore =
    categoryComponent +
    priorityComponent +
    quickWinComponent +
    highLeverageComponent +
    dueBoost +
    stalenessComponent +
    subtaskComponent;

  return {
    score: rawScore,
    components: {
      categoryComponent,
      priorityComponent,
      quickWinComponent,
      highLeverageComponent,
      dueBoost,
      stalenessComponent,
      subtaskComponent,
      baseCategory: baseCat,
      modeAdjustment: modeAdj,
      priorityWeight: prioW,
      isQuickWin,
      isHighLeverage: highLev,
    },
  };
}

// Choose N key outcomes, preferring a Quick Win for #1 when available.
export function chooseKeyOutcomes(tasks, options) {
  const {
    mode = "Strategic Push",
    todayStr,
    now = new Date(),
    lastCompletedMap = {},
    count = DAILY_KEY_OUTCOMES_COUNT,
  } = options || {};

  if (!Array.isArray(tasks) || tasks.length === 0 || count <= 0) {
    return [];
  }

  // Precompute scores
  const withScores = tasks.map((t) => {
    const lastCompletedAt = lastCompletedMap[t.id] || null;
    const scoring = computeTaskScore(t, { mode, todayStr, now, lastCompletedAt });
    return {
      task: t,
      score: scoring.score,
      breakdown: scoring.components,
    };
  });

  // Helper to detect quick win
  const isQuickWinCandidate = (entry) =>
    entry.breakdown.isQuickWin === true;

  // Sort by score (stable via id for deterministic behavior)
  const sorted = [...withScores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.task.id < b.task.id) return -1;
    if (a.task.id > b.task.id) return 1;
    return 0;
  });

  const picked = [];
  const usedIds = new Set();

  // Outcome #1: prefer a quick-win if possible
  const firstQuickWin = sorted.find(
    (entry) => !usedIds.has(entry.task.id) && isQuickWinCandidate(entry)
  );
  if (firstQuickWin) {
    picked.push(firstQuickWin);
    usedIds.add(firstQuickWin.task.id);
  } else if (sorted.length > 0) {
    picked.push(sorted[0]);
    usedIds.add(sorted[0].task.id);
  }

  // Remaining outcomes: highest remaining scores
  for (const entry of sorted) {
    if (picked.length >= count) break;
    if (usedIds.has(entry.task.id)) continue;
    picked.push(entry);
    usedIds.add(entry.task.id);
  }

  return picked.slice(0, count);
}

// Workout helpers
export function getWorkoutPhaseForDate(dateStr) {
  const start = new Date(WORKOUT_CYCLE_START);
  const today = new Date(dateStr);
  const diffDays = Math.floor(
    (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const idx = ((diffDays % WORKOUT_PATTERN.length) + WORKOUT_PATTERN.length) %
    WORKOUT_PATTERN.length;
  return WORKOUT_PATTERN[idx];
}

export function getWorkoutPlanForDate(dateStr) {
  const phase = getWorkoutPhaseForDate(dateStr);
  const base = WORKOUT_TASKS[phase];
  if (!base) {
    return null;
  }
  const syntheticId = `workout-${dateStr}`;
  return {
    id: syntheticId,
    phase,
    title: base.title,
    priority: base.priority,
    tags: base.tags,
  };
}

