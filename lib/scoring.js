// Shared scoring configuration and helpers for key outcome selection
// Single source of truth for:
// - mode weights
// - scoring algorithm for daily key outcomes

import { OCCAM_WORKOUTS } from "./occam";
import { getWorkoutPlanForSchedule } from "./occamSchedule";

export const TIMEZONE = "America/New_York";

// SCORING_MODEL.md: category_weight * 8 in final score
export const BASE_CATEGORY_WEIGHTS = {
  Business: 5,
  "Rental House": 4,
  Vehicles: 3,
  Home: 2,
  Boat: 1,
  Personal: 2,
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

// Occam-focused cycle: A → recovery → B → recovery (aligns with ~2 heavy sessions / week + mobility)
export const WORKOUT_CYCLE_START = "2026-02-16";
export const WORKOUT_PATTERN = ["Occam A", "Recovery", "Occam B", "Recovery"];

export const WORKOUT_TASKS = {
  "Occam A": {
    id: "workout-occam-a",
    title: "Occam Protocol — Workout A",
    priority: "High",
    tags: ["workout", "occam", "strength"],
    exercises: OCCAM_WORKOUTS["Occam A"].exercises,
    occamLabel: OCCAM_WORKOUTS["Occam A"].label,
  },
  "Occam B": {
    id: "workout-occam-b",
    title: "Occam Protocol — Workout B",
    priority: "High",
    tags: ["workout", "occam", "strength"],
    exercises: OCCAM_WORKOUTS["Occam B"].exercises,
    occamLabel: OCCAM_WORKOUTS["Occam B"].label,
  },
  Recovery: {
    id: "workout-recovery",
    title: "Recovery — walk, stretch, light mobility",
    priority: "Medium",
    tags: ["workout", "recovery", "occam"],
    exercises: [],
    occamLabel: "Active recovery (between Occam sessions)",
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

function isBlockedOrWaiting(task) {
  return hasAnyTag(task, ["blocked", "waiting"]);
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

// SCORING_MODEL.md: Critical=50, High=40, Medium=30, Low=20
function priorityScore(priority) {
  switch (priority) {
    case "Critical":
      return 50;
    case "High":
      return 40;
    case "Medium":
      return 30;
    case "Low":
      return 20;
    default:
      return 20;
  }
}

function hoursEffort(task) {
  if (!task) return null;
  if (typeof task.effort_hours === "number") return task.effort_hours;
  if (typeof task.effort === "number") return task.effort;
  return null;
}

// SCORING_MODEL.md: staleness_boost = days_since_last_completion/7*5, max 3
function stalenessBoost(lastCompletedAt, now) {
  const last = lastCompletedAt ? new Date(lastCompletedAt) : null;
  const diffDays = last
    ? Math.max(
        0,
        Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
      )
    : 999;
  const raw = (diffDays / 7) * 5;
  return Math.min(raw, 3);
}

// SCORING_MODEL.md: effort_penalty = effort_hours/2, max 6
function effortPenalty(task) {
  const eff = hoursEffort(task);
  if (eff == null || eff <= 0) return 0;
  return Math.min(eff / 2, 6);
}

// SCORING_MODEL.md: quick-win=+6, high-leverage=+6, urgent=+4
function tagBoost(task) {
  const names = extractTagNames(task);
  const norm = new Set(names.map(normalizeTag));
  let boost = 0;
  // Fire-fighting tasks represent urgent interrupt work and should float to the top.
  if (norm.has("fire-fighting") || norm.has("firefighting")) boost += 100;
  if (norm.has("quick-win") || norm.has("easy-win")) boost += 6;
  if (
    norm.has("high-leverage") ||
    norm.has("high leverage") ||
    norm.has("high_leverage")
  ) {
    boost += 6;
  }
  if (norm.has("urgent")) boost += 4;
  return boost;
}

// SCORING_MODEL.md: Final = priority_score + category_weight*8 + staleness_boost + tag_boost + subtask_boost - effort_penalty
export function computeTaskScore(task, options) {
  const {
    mode = "Strategic Push",
    now = new Date(),
    lastCompletedAt = null,
    baseCategoryWeights = BASE_CATEGORY_WEIGHTS,
    quickWinMinutes = 30,
    // Cross-project arbiter signals (all optional)
    nextActionTaskIds = null,
    quarterFocusOutcomeIds = null,
    capacity = "normal",
    lifeSituationKeywords = null,
    staleProjectCategoryIds = null,
  } = options || {};

  const categoryName = getCategoryName(task) || "Other";
  const baseCat = (baseCategoryWeights && baseCategoryWeights[categoryName]) ?? 1;
  const modeAdj = (MODE_ADJUSTMENTS[mode] || {})[categoryName] ?? 0;
  const categoryComponent = (baseCat + modeAdj) * 8;

  const prioScore = priorityScore(task.priority);
  const tagB = tagBoost(task);
  const stalenessComponent = stalenessBoost(lastCompletedAt, now);
  const subtaskComponent = task.parent_task_id ? 6 : 0;
  const effortP = effortPenalty(task);

  // Cross-project arbiter components
  let nextActionBoost = 0;
  if (nextActionTaskIds && nextActionTaskIds.has && nextActionTaskIds.has(task.id)) {
    nextActionBoost = 15;
  }

  let outcomeBoost = 0;
  if (quarterFocusOutcomeIds && Array.isArray(task.outcome_ids) && task.outcome_ids.length > 0) {
    const hit = task.outcome_ids.some((id) => quarterFocusOutcomeIds.has(String(id)));
    if (hit) outcomeBoost = 6;
  }

  let capacityFit = 0;
  if (capacity === "heavy" || capacity === "overwhelmed") {
    const eff = hoursEffort(task);
    if (eff != null) {
      if (eff <= 0.5) capacityFit = 6;
      else if (eff > 1) capacityFit = -6;
    }
  }

  let lifeKeywordBoost = 0;
  if (lifeSituationKeywords && lifeSituationKeywords.size > 0) {
    const title = String(task.title || "").toLowerCase();
    for (const kw of lifeSituationKeywords) {
      if (!kw) continue;
      if (title.includes(kw)) {
        lifeKeywordBoost = 4;
        break;
      }
    }
  }

  let stalePenalty = 0;
  if (
    staleProjectCategoryIds &&
    staleProjectCategoryIds.has &&
    staleProjectCategoryIds.has(String(task.category_id))
  ) {
    stalePenalty = -8;
  }

  const rawScore =
    prioScore +
    categoryComponent +
    stalenessComponent +
    tagB +
    subtaskComponent -
    effortP +
    nextActionBoost +
    outcomeBoost +
    capacityFit +
    lifeKeywordBoost +
    stalePenalty;

  const quickWinTag = hasAnyTag(task, ["quick-win", "easy-win"]);
  const eff = hoursEffort(task);
  const quickWinEffort =
    eff != null && quickWinMinutes
      ? eff * 60 <= quickWinMinutes
      : eff != null && eff <= 1;
  const isQuickWin = quickWinTag || quickWinEffort;
  const highLev = hasAnyTag(task, [
    "high-leverage",
    "high leverage",
    "high_leverage",
  ]);

  return {
    score: rawScore,
    components: {
      categoryComponent,
      priorityScore: prioScore,
      tagBoost: tagB,
      stalenessComponent,
      subtaskComponent,
      effortPenalty: effortP,
      baseCategory: baseCat,
      modeAdjustment: modeAdj,
      isQuickWin,
      isHighLeverage: highLev,
      nextActionBoost,
      outcomeBoost,
      capacityFit,
      lifeKeywordBoost,
      stalePenalty,
    },
  };
}

// SCORING_MODEL.md: 1 Quick Win, 1 High Leverage, 1 Progress Task
export function chooseKeyOutcomes(tasks, options) {
  const {
    mode = "Strategic Push",
    now = new Date(),
    lastCompletedMap = {},
    count = DAILY_KEY_OUTCOMES_COUNT,
    baseCategoryWeights,
    quickWinMinutes,
    nextActionTaskIds,
    quarterFocusOutcomeIds,
    capacity,
    lifeSituationKeywords,
    staleProjectCategoryIds,
  } = options || {};

  if (!Array.isArray(tasks) || tasks.length === 0 || count <= 0) {
    return [];
  }

  const eligibleTasks = tasks.filter((t) => !isBlockedOrWaiting(t));
  if (eligibleTasks.length === 0) return [];

  const withScores = eligibleTasks.map((t) => {
    const lastCompletedAt = lastCompletedMap[t.id] || null;
    const scoring = computeTaskScore(t, {
      mode,
      now,
      lastCompletedAt,
      baseCategoryWeights,
      quickWinMinutes,
      nextActionTaskIds,
      quarterFocusOutcomeIds,
      capacity,
      lifeSituationKeywords,
      staleProjectCategoryIds,
    });
    return {
      task: t,
      score: scoring.score,
      breakdown: scoring.components,
    };
  });

  const sorted = [...withScores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.task.id < b.task.id) return -1;
    if (a.task.id > b.task.id) return 1;
    return 0;
  });

  const picked = [];
  const usedIds = new Set();

  // Fire-fighting always comes first in today's queue.
  const fireFightingFirst = sorted.find((e) =>
    hasAnyTag(e.task, ["fire-fighting", "firefighting"])
  );
  if (fireFightingFirst) {
    picked.push(fireFightingFirst);
    usedIds.add(fireFightingFirst.task.id);
  }

  // Slot 1: Quick Win (best scoring quick-win candidate)
  const quickWins = sorted.filter((e) => e.breakdown.isQuickWin && !usedIds.has(e.task.id));
  if (quickWins.length > 0) {
    picked.push(quickWins[0]);
    usedIds.add(quickWins[0].task.id);
  } else if (sorted.length > 0) {
    picked.push(sorted[0]);
    usedIds.add(sorted[0].task.id);
  }

  // Slot 2: High Leverage (best scoring high-leverage candidate not yet picked)
  const highLeverage = sorted.filter((e) => e.breakdown.isHighLeverage && !usedIds.has(e.task.id));
  if (highLeverage.length > 0) {
    picked.push(highLeverage[0]);
    usedIds.add(highLeverage[0].task.id);
  }
  // Slot 3: Progress Task (highest scoring remaining)
  for (const entry of sorted) {
    if (picked.length >= count) break;
    if (usedIds.has(entry.task.id)) continue;
    picked.push(entry);
    usedIds.add(entry.task.id);
  }

  return picked.slice(0, count);
}

/**
 * Produce a human-readable rationale sentence for why a task was chosen now.
 * Receives the output of computeTaskScore plus the mode string.
 */
export function buildRationale(task, scoringResult, mode) {
  const c = scoringResult?.components || {};
  const parts = [];

  if (c.isQuickWin) {
    const eff = hoursEffort(task);
    parts.push(
      eff != null
        ? `Quick win — about ${Math.round(eff * 60)} min`
        : "Quick win"
    );
  }

  if (c.isHighLeverage) {
    parts.push("High-leverage task");
  }

  const catName = getCategoryName(task);
  if (catName && (c.categoryComponent || 0) > 16) {
    const modeNote = c.modeAdjustment > 0
      ? ` (boosted in ${mode} mode)`
      : "";
    parts.push(`Strong ${catName} fit${modeNote}`);
  }

  if ((c.priorityScore || 0) >= 40) {
    parts.push(`${task.priority || "High"} priority`);
  }

  if ((c.stalenessComponent || 0) >= 2) {
    const approxDays = Math.round((c.stalenessComponent / 5) * 7);
    parts.push(
      approxDays >= 14
        ? `Overdue for attention (~${approxDays} days)`
        : "Not worked on recently"
    );
  }

  if (task.due_date) {
    const now = new Date();
    const due = new Date(task.due_date);
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const daysUntil = Math.round((dueUtc - todayUtc) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 7 && daysUntil >= 0) {
      if (daysUntil === 0) parts.push("Due today");
      else if (daysUntil === 1) parts.push("Due tomorrow");
      else parts.push(`Due in ${daysUntil} days`);
    }
  }

  if (task.parent_task_id && (c.subtaskComponent || 0) > 0) {
    parts.push("Moves a larger goal forward");
  }

  if (parts.length === 0) {
    return mode
      ? `Top-scored task for ${mode} mode`
      : "Top-scored task for your current focus";
  }

  return parts.join(" · ");
}

const OUTCOME_LABELS = {
  Business: "Career & business goals",
  "Rental House": "Property & rental progress",
  Vehicles: "Vehicle reliability",
  Home: "Home environment",
  Boat: "Boat upkeep",
  Personal: "Personal growth",
};

export function getOutcomeLabel(categoryName) {
  if (!categoryName) return null;
  return OUTCOME_LABELS[categoryName] || categoryName;
}

export function getCategoryForTask(task) {
  if (!task) return null;
  if (typeof task.category === "string") return task.category;
  if (task.category && typeof task.category.name === "string")
    return task.category.name;
  if (typeof task.category_name === "string") return task.category_name;
  return null;
}

/**
 * Merge profile base_category_weights with order-derived weights when
 * profile.preferences.category_order_ids is set (left = highest priority).
 * categoryIdToName: { [categoryId: string]: categoryName: string }.
 * Returns weights keyed by category name for use in computeTaskScore/chooseKeyOutcomes.
 */
export function getEffectiveCategoryWeights(profilePrefs, categoryIdToName = {}) {
  const base = profilePrefs?.base_category_weights || BASE_CATEGORY_WEIGHTS;
  const orderIds = profilePrefs?.category_order_ids;
  if (!Array.isArray(orderIds) || orderIds.length === 0) return base;
  const derived = {};
  for (let i = 0; i < orderIds.length; i++) {
    const name = categoryIdToName[orderIds[i]];
    if (name) derived[name] = Math.max(1, orderIds.length - i);
  }
  return Object.keys(derived).length > 0 ? { ...base, ...derived } : base;
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

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {{ preferences?: object, setsWithSession?: object[], now?: Date } | null} ctx
 *   When provided, uses completion-based Occam rotation + 48h recovery.
 *   When omitted, uses fixed calendar cycle (legacy).
 */
export function getWorkoutPlanForDate(dateStr, ctx = null) {
  if (ctx && (ctx.setsWithSession !== undefined || ctx.preferences !== undefined)) {
    return getWorkoutPlanForSchedule(dateStr, ctx);
  }
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
    exercises: base.exercises || [],
    occamLabel: base.occamLabel || null,
  };
}

