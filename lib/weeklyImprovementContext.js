import { mergeProjectWorkspace } from "./projectWorkspace";
import { computeTaskScore } from "./scoring";
import { countRefinementActions } from "./planner-refinement-events";

export const WEEKLY_COACH_PROMPT_VERSION = "weekly_coach_v1";
export const WEEKLY_IMPROVEMENT_SCORING_VERSION = "weekly_metrics_v1";

const LIFE_DOMAIN_KEYS = [
  "business",
  "finances",
  "health",
  "relationships",
  "lifestyle",
  "growth",
];

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

export function getWeekRangeFromStart(weekStart) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    start: toDateOnly(start),
    end: toDateOnly(end),
  };
}

function prevWeekStart(weekStart) {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return toDateOnly(d);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function parseWeeklyReviewNotes(notes) {
  if (!notes) return {};
  if (typeof notes === "string") {
    try {
      return JSON.parse(notes);
    } catch {
      return {};
    }
  }
  return notes || {};
}

export function extractTagNames(task) {
  if (!task || !task.tags) return [];
  const result = [];
  for (const t of task.tags) {
    if (!t) continue;
    if (typeof t === "string") result.push(t);
    else if (t.tag?.name) result.push(t.tag.name);
    else if (t.name) result.push(t.name);
  }
  return result;
}

function safeDateMs(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function isOverdue(task, now = new Date()) {
  if (!task?.due_date || task.status === "done" || task.status === "archived") return false;
  const due = new Date(`${task.due_date}T23:59:59`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function isTaskNeedingAlignment(task) {
  const hasOutcome = Array.isArray(task?.outcome_ids) && task.outcome_ids.length > 0;
  const hasDomain = typeof task?.primary_life_domain === "string" && task.primary_life_domain;
  return !hasOutcome && !hasDomain;
}

export function isTaskNeedingSubtasks(task) {
  if (!task || task.parent_task_id) return false;
  const effort = Number(task.effort_hours || 0);
  const title = String(task.title || "");
  return effort >= 2.5 || title.length >= 64;
}

export function isStaleDoingTask(task, now = new Date()) {
  if (!task || task.status !== "doing") return false;
  const lastTouch = Math.max(safeDateMs(task.updated_at), safeDateMs(task.created_at));
  if (!lastTouch) return false;
  const ageDays = Math.floor((now.getTime() - lastTouch) / (1000 * 60 * 60 * 24));
  return ageDays >= 7;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function countBy(list, keyFn) {
  const map = new Map();
  for (const item of list || []) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function workspaceCompleteness(workspace) {
  let score = 0;
  if (workspace?.mantra?.trim()) score += 1;
  if (workspace?.narrative?.trim()) score += 2;
  if (workspace?.efficiency_tip?.trim()) score += 1;
  if ((workspace?.suggested_moves || []).length > 0) score += 1;
  if ((workspace?.resources || []).length > 0) score += 1;
  return score;
}

function inferLifeDomainFromText(task, profile) {
  const text = normalizeText(
    [
      task?.title,
      task?.category?.name,
      task?.category_name,
      task?.primary_life_domain,
      ...(extractTagNames(task) || []),
    ].join(" ")
  );
  const labels = profile?.life_domains || {};
  const candidates = [
    { key: "business", terms: ["business", "sales", "revenue", "client", "product", "automation"] },
    { key: "finances", terms: ["finance", "money", "cash", "rental", "house", "property", "budget", "tax"] },
    { key: "health", terms: ["health", "workout", "sleep", "meal", "body", "recovery"] },
    { key: "relationships", terms: ["family", "mom", "dad", "wife", "kids", "relationship", "friend"] },
    { key: "lifestyle", terms: ["travel", "home", "vehicle", "boat", "adventure", "lifestyle"] },
    { key: "growth", terms: ["learn", "study", "read", "growth", "course", "skill"] },
  ];
  for (const candidate of candidates) {
    if (candidate.terms.some((term) => text.includes(term))) return candidate.key;
    const labelText = normalizeText(labels[candidate.key]);
    if (labelText && labelText.length >= 4 && text.includes(labelText.slice(0, Math.min(12, labelText.length)))) {
      return candidate.key;
    }
  }
  return null;
}

function inferOutcomeIdsFromText(task, profile) {
  const text = normalizeText([task?.title, task?.category?.name, task?.category_name].join(" "));
  const outcomes = profile?.desired_outcomes || [];
  const ids = [];
  for (const outcome of outcomes) {
    const title = normalizeText(outcome?.title);
    if (!title) continue;
    const tokens = title.split(/\s+/).filter((token) => token.length >= 4);
    if (tokens.some((token) => text.includes(token))) ids.push(outcome.id || outcome.title);
  }
  return uniqueStrings(ids).slice(0, 2);
}

function createSubtaskTitle(parentTitle) {
  const base = String(parentTitle || "Task").trim();
  if (!base) return "Clarify next action";
  if (/call|email|text|follow up/i.test(base)) return `Draft prep for ${base}`;
  if (/plan|strategy|system/i.test(base)) return `Outline first pass for ${base}`;
  if (/build|create|launch/i.test(base)) return `Define smallest shippable step for ${base}`;
  return `Define the next concrete step for ${base}`;
}

function projectNameForTask(task, categoriesById) {
  return task?.category?.name || categoriesById.get(task?.category_id)?.name || "Project";
}

function buildProjectContexts({
  categories,
  rootTasks,
  completionsThisWeek,
  profile,
  now,
}) {
  const categoriesById = new Map((categories || []).map((c) => [c.id, c]));
  const completionCountByCategory = countBy(completionsThisWeek, (ev) => ev?.task?.category_id || ev?.task?.category?.id);
  const completionLookup = new Map(completionCountByCategory.map((row) => [row.key, row.count]));

  return (categories || []).map((category) => {
    const categoryTasks = (rootTasks || []).filter((t) => String(t.category_id) === String(category.id));
    const workspace = mergeProjectWorkspace(profile?.preferences, category.id);
    const open = categoryTasks.filter((t) => t.status !== "done" && t.status !== "archived");
    const aligned = categoryTasks.filter((t) => !isTaskNeedingAlignment(t)).length;
    const staleDoing = categoryTasks.filter((t) => isStaleDoingTask(t, now)).length;
    const overdue = categoryTasks.filter((t) => isOverdue(t, now)).length;
    const needsSubtasks = categoryTasks.filter((t) => isTaskNeedingSubtasks(t)).length;
    const alignmentCoveragePct = categoryTasks.length > 0 ? Math.round((aligned / categoryTasks.length) * 100) : 0;
    return {
      category_id: category.id,
      category_name: category.name,
      root_task_count: categoryTasks.length,
      open_root_count: open.length,
      completed_this_week: completionLookup.get(category.id) || 0,
      overdue_count: overdue,
      stale_doing_count: staleDoing,
      needs_subtasks_count: needsSubtasks,
      unaligned_count: categoryTasks.filter((t) => isTaskNeedingAlignment(t)).length,
      alignment_coverage_pct: alignmentCoveragePct,
      workspace_completeness: workspaceCompleteness(workspace),
      workspace,
      needs_attention:
        alignmentCoveragePct < 55 ||
        overdue > 0 ||
        staleDoing > 0 ||
        needsSubtasks > 0 ||
        workspaceCompleteness(workspace) <= 2,
    };
  });
}

function scoreTask(task, mode, now = new Date()) {
  return computeTaskScore(
    { ...task, tags: extractTagNames(task) },
    { mode, now }
  ).score;
}

export function buildWeeklyImprovementContext({
  weekStart,
  profile,
  categories = [],
  tasks = [],
  completionsThisWeek = [],
  completionsLastWeek = [],
  latestReview = null,
  allReviews = [],
  refinementEvents = [],
  improvementRuns = [],
  now = new Date(),
}) {
  const week = getWeekRangeFromStart(weekStart);
  const parsedReview = parseWeeklyReviewNotes(latestReview?.notes);
  const mode = profile?.preferences?.default_mode || "Strategic Push";
  const rootTasks = (tasks || []).filter((t) => !t.parent_task_id);
  const openRoots = rootTasks.filter((t) => t.status !== "done" && t.status !== "archived");
  const tasksById = new Map((tasks || []).map((t) => [t.id, t]));
  const completionEventsThisWeek = (completionsThisWeek || []).map((ev) => ({
    ...ev,
    task: ev.task || tasksById.get(ev.task_id) || null,
  }));
  const completionEventsLastWeek = (completionsLastWeek || []).map((ev) => ({
    ...ev,
    task: ev.task || tasksById.get(ev.task_id) || null,
  }));

  const projectContexts = buildProjectContexts({
    categories,
    rootTasks,
    completionsThisWeek: completionEventsThisWeek,
    profile,
    now,
  });

  const needsAlignment = openRoots.filter(isTaskNeedingAlignment);
  const needsSubtasks = openRoots.filter(isTaskNeedingSubtasks);
  const staleDoing = openRoots.filter((t) => isStaleDoingTask(t, now));
  const overdue = openRoots.filter((t) => isOverdue(t, now));
  const priorityCleanup = openRoots.filter((t) => {
    const score = scoreTask(t, mode, now);
    return (!t.priority || t.priority === "Medium") && score >= 70;
  });

  const alignedRoots = rootTasks.filter((t) => !isTaskNeedingAlignment(t)).length;
  const alignmentCoveragePct = rootTasks.length > 0 ? Math.round((alignedRoots / rootTasks.length) * 100) : 0;
  const refinements = countRefinementActions(refinementEvents || []);

  const topWorkedCategories = countBy(
    completionEventsThisWeek.map((ev) => ev.task).filter(Boolean),
    (task) => projectNameForTask(task, new Map((categories || []).map((c) => [c.id, c])))
  ).slice(0, 4);

  const topWorkedOutcomes = countBy(
    completionEventsThisWeek.flatMap((ev) => ev.task?.outcome_ids || []),
    (id) => id
  ).slice(0, 4);

  const topWorkedDomains = countBy(
    completionEventsThisWeek.map((ev) => ev.task?.primary_life_domain).filter(Boolean),
    (domain) => domain
  ).slice(0, 4);

  const completionDelta = completionEventsThisWeek.length - completionEventsLastWeek.length;
  const momentumScore = Math.max(
    0,
    Math.round(
      completionEventsThisWeek.length * 8 +
      alignmentCoveragePct * 0.35 -
      overdue.length * 4 -
      staleDoing.length * 3 +
      (refinements.applied || 0) * 2
    )
  );

  return {
    versions: {
      prompt_version: WEEKLY_COACH_PROMPT_VERSION,
      scoring_version: WEEKLY_IMPROVEMENT_SCORING_VERSION,
    },
    profile,
    week,
    review: {
      row: latestReview,
      notes: parsedReview,
      all_reviews_count: (allReviews || []).length,
      previous_week_start: prevWeekStart(weekStart),
    },
    overview: {
      root_task_count: rootTasks.length,
      open_root_count: openRoots.length,
      completed_this_week: completionEventsThisWeek.length,
      completed_last_week: completionEventsLastWeek.length,
      completion_delta: completionDelta,
      overdue_count: overdue.length,
      stale_doing_count: staleDoing.length,
      needs_alignment_count: needsAlignment.length,
      needs_subtasks_count: needsSubtasks.length,
      alignment_coverage_pct: alignmentCoveragePct,
      momentum_score: momentumScore,
      weekly_theme: parsedReview?.weekly_theme?.theme || "",
      top_leverage_note: parsedReview?.weekly_theme?.why || "",
    },
    task_queues: {
      needs_alignment: needsAlignment.map((task) => ({
        id: task.id,
        title: task.title,
        category_id: task.category_id,
        category_name: projectNameForTask(task, new Map((categories || []).map((c) => [c.id, c]))),
        _task: task,
      })),
      needs_subtasks: needsSubtasks.map((task) => ({
        id: task.id,
        title: task.title,
        category_id: task.category_id,
        category_name: projectNameForTask(task, new Map((categories || []).map((c) => [c.id, c]))),
        _task: task,
      })),
      stale_doing: staleDoing.map((task) => ({
        id: task.id,
        title: task.title,
        category_id: task.category_id,
        category_name: projectNameForTask(task, new Map((categories || []).map((c) => [c.id, c]))),
        _task: task,
      })),
      overdue: overdue.map((task) => ({
        id: task.id,
        title: task.title,
        due_date: task.due_date,
        category_id: task.category_id,
        category_name: projectNameForTask(task, new Map((categories || []).map((c) => [c.id, c]))),
        _task: task,
      })),
      priority_cleanup: priorityCleanup.map((task) => ({
        id: task.id,
        title: task.title,
        category_id: task.category_id,
        category_name: projectNameForTask(task, new Map((categories || []).map((c) => [c.id, c]))),
        _task: task,
      })),
    },
    projects: projectContexts,
    signals: {
      refinements,
      top_worked_categories: topWorkedCategories,
      top_worked_outcomes: topWorkedOutcomes.map((row) => ({
        ...row,
        label: (profile?.desired_outcomes || []).find((o) => (o.id || o.title) === row.key)?.title || row.key,
      })),
      top_worked_domains: topWorkedDomains.map((row) => ({
        ...row,
        label: profile?.life_domains?.[row.key] || row.key,
      })),
      improvement_runs: summarizeImprovementRuns(improvementRuns || []),
    },
  };
}

function defaultProjectFix(project) {
  const moveTitle = project.completed_this_week > 0
    ? `Codify the next repeatable move for ${project.category_name}`
    : `Define the next milestone for ${project.category_name}`;
  return {
    id: `project_fix_${project.category_id}`,
    type: "project_fix",
    category_id: project.category_id,
    title: `Tighten ${project.category_name} strategy`,
    summary:
      project.workspace_completeness <= 2
        ? "This workspace is under-defined. Add a clearer narrative, efficiency tip, and next move."
        : "This project has work but the structure is still noisy. Clarify the next leverage move.",
    apply_patch: {
      workspace: {
        suggested_move: moveTitle,
        efficiency_tip:
          project.workspace?.efficiency_tip ||
          "Keep the next move concrete enough to complete in one focused sitting.",
      },
    },
  };
}

function defaultAlignmentFix(task, profile) {
  const inferredDomain = inferLifeDomainFromText(task, profile);
  const inferredOutcomeIds = inferOutcomeIdsFromText(task, profile);
  return {
    id: `alignment_fix_${task.id}`,
    type: "alignment_fix",
    task_id: task.id,
    title: `Align “${task.title}” to the vision`,
    summary: "This task is active but not linked to a desired outcome or life domain.",
    apply_patch: {
      task: {
        outcome_ids: inferredOutcomeIds,
        primary_life_domain: inferredDomain,
        alignment_source: inferredDomain || inferredOutcomeIds.length > 0 ? "ai" : null,
      },
    },
  };
}

function defaultPriorityAdjustment(task) {
  const tagsAdd = [];
  if (isOverdue(task)) tagsAdd.push("urgent");
  if ((task.effort_hours || 0) <= 0.5) tagsAdd.push("quick-win");
  return {
    id: `priority_adjustment_${task.id}`,
    type: "priority_adjustment",
    task_id: task.id,
    title: `Re-rank “${task.title}”`,
    summary: "This task scores higher than its stored priority suggests.",
    apply_patch: {
      task: {
        priority: isOverdue(task) ? "High" : "Medium",
      },
      tags_add: uniqueStrings(tagsAdd),
    },
  };
}

function defaultSubtaskSuggestion(task) {
  const estimatedMinutes = Math.max(20, Math.min(45, Math.round((Number(task.effort_hours || 1) * 60) / 4 / 5) * 5));
  return {
    id: `subtask_suggestion_${task.id}`,
    type: "subtask_suggestion",
    parent_task_id: task.id,
    title: `Split “${task.title}” into a next action`,
    summary: "This task looks too large for smooth weekly momentum.",
    apply_patch: {
      create_task: {
        title: createSubtaskTitle(task.title),
        estimated_minutes: estimatedMinutes,
        tags: ["quick-win"],
      },
    },
  };
}

export function buildFallbackWeeklyCoachOutput(context) {
  const projectFixes = (context.projects || [])
    .filter((p) => p.needs_attention)
    .slice(0, 3)
    .map(defaultProjectFix);

  const alignmentFixes = (context.task_queues?.needs_alignment || [])
    .slice(0, 5)
    .map((row) => defaultAlignmentFix(row._task || row, context.profile || {}));

  const subtaskSuggestions = (context.task_queues?.needs_subtasks || [])
    .slice(0, 4)
    .map((row) => defaultSubtaskSuggestion(row._task || row));

  const priorityAdjustments = (context.task_queues?.priority_cleanup || [])
    .slice(0, 4)
    .map((row) => defaultPriorityAdjustment(row._task || row));

  const appImprovementSuggestions = [];
  if ((context.signals?.improvement_runs?.acceptance_rate || 0) < 50 && (context.signals?.improvement_runs?.total_runs || 0) >= 2) {
    appImprovementSuggestions.push({
      id: "app_feedback_surface",
      title: "Shorten suggestion cards",
      summary: "Acceptance is low; reduce card length and lead with the smallest high-confidence fixes first.",
      area: "ui",
    });
  }
  if ((context.signals?.refinements?.dismissed || 0) > (context.signals?.refinements?.accepted || 0)) {
    appImprovementSuggestions.push({
      id: "app_planner_prompt",
      title: "Tighten daily planner prompting",
      summary: "Planner dismissals exceed acceptances; make slot reasoning and effort recommendations more conservative.",
      area: "planner_prompt",
    });
  }

  const topProject = (context.projects || []).find((p) => p.completed_this_week > 0) || (context.projects || [])[0];
  return {
    summary:
      context.overview?.completion_delta >= 0
        ? "Momentum is building, but there are a few structure and alignment gaps worth tightening this week."
        : "Execution dipped week over week. A smaller, cleaner operating loop should help restore momentum.",
    next_week_focus: {
      theme: topProject?.category_name || "Strategic clarity",
      why:
        context.overview?.overdue_count > 0
          ? "A little cleanup now will remove drag from the week ahead."
          : "This area has the clearest path to visible progress next week.",
    },
    project_fixes: projectFixes,
    task_fixes: [],
    alignment_fixes: alignmentFixes,
    subtask_suggestions: subtaskSuggestions,
    priority_adjustments: priorityAdjustments,
    scoring_tweaks: (context.signals?.top_worked_categories || []).slice(0, 2).map((row) => ({
      id: `scoring_tweak_${row.key}`,
      category_name: row.key,
      suggested_weight: 1,
      summary: "Recent evidence suggests this category deserves a temporary weekly weighting bump.",
    })),
    app_improvement_suggestions: appImprovementSuggestions,
  };
}

export function flattenWeeklyCoachActions(aiOutput) {
  const buckets = [
    "project_fixes",
    "task_fixes",
    "alignment_fixes",
    "subtask_suggestions",
    "priority_adjustments",
  ];
  return buckets.flatMap((bucket) => (Array.isArray(aiOutput?.[bucket]) ? aiOutput[bucket] : []));
}

export function summarizeImprovementRuns(runs) {
  const totalRuns = (runs || []).length;
  let totalAccepted = 0;
  let totalRejected = 0;
  let totalApplied = 0;

  for (const run of runs || []) {
    totalAccepted += Array.isArray(run.accepted_action_ids) ? run.accepted_action_ids.length : 0;
    totalRejected += Array.isArray(run.rejected_action_ids) ? run.rejected_action_ids.length : 0;
    totalApplied += Array.isArray(run.applied_action_ids) ? run.applied_action_ids.length : 0;
  }

  const totalDecisions = totalAccepted + totalRejected;
  return {
    total_runs: totalRuns,
    total_accepted: totalAccepted,
    total_rejected: totalRejected,
    total_applied: totalApplied,
    acceptance_rate: totalDecisions > 0 ? Math.round((totalAccepted / totalDecisions) * 100) : 0,
    application_rate: totalAccepted > 0 ? Math.round((totalApplied / totalAccepted) * 100) : 0,
  };
}

export function buildImprovementLabReport(runs) {
  const summaries = summarizeImprovementRuns(runs || []);
  const byPrompt = countBy(runs || [], (run) => run.prompt_version || "unknown");
  const byModel = countBy(runs || [], (run) => run.model || "unknown");
  return {
    ...summaries,
    by_prompt_version: byPrompt,
    by_model: byModel,
  };
}
