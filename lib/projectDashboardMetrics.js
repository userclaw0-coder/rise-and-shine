/**
 * Client-side metrics for the Projects dashboard tiles (health, insight, last activity).
 * Insights are rule-based from task density, priorities, and scoring — not an LLM call.
 */

import { computeTaskScore } from "./scoring.js";

function extractTagNames(task) {
  if (!task || !task.tags) return [];
  const result = [];
  for (const t of task.tags) {
    if (!t) continue;
    if (typeof t === "string") result.push(t);
    else if (t.tag && t.tag.name) result.push(t.tag.name);
    else if (t.name) result.push(t.name);
  }
  return result;
}

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOverdue(task, now) {
  if (!task?.due_date || task.status === "done" || task.status === "archived") return false;
  const due = new Date(`${task.due_date}T23:59:59`);
  return due < startOfToday(now);
}

function isHighPriority(p) {
  return p === "High" || p === "Critical";
}

/**
 * @param {string|Date|null|undefined} isoOrDate
 */
export function formatRelativeActivity(isoOrDate) {
  if (!isoOrDate) return "No recent activity";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "No recent activity";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 45 * 1000) return "Active now";
  const min = Math.floor(diffMs / (60 * 1000));
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 36) return `Active ${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 14) return `Active ${days}d ago`;
  const wk = Math.floor(days / 7);
  return `Active ${wk}w ago`;
}

function buildInsight({
  overdue,
  highOpen,
  doing,
  doneRatio,
  topOpenTitle,
  openRoots,
  totalRoots,
}) {
  if (totalRoots === 0) {
    return "Quiet workspace — add your next strategic move when you are ready.";
  }
  if (overdue >= 4) {
    return `${overdue} items are past due — a short triage pass could unlock momentum.`;
  }
  if (overdue >= 1) {
    return `${overdue} task${overdue > 1 ? "s are" : " is"} overdue — schedule time to close the loop.`;
  }
  if (highOpen >= 4) {
    return `${highOpen} high-priority tasks are open — pick one anchor outcome for today.`;
  }
  if (highOpen >= 1) {
    return `${highOpen} high-priority item${highOpen > 1 ? "s" : ""} still open — what unblocks them fastest?`;
  }
  if (doing >= 3) {
    return `${doing} initiatives in motion — consider finishing one thread before starting another.`;
  }
  if (doneRatio >= 0.8 && openRoots > 0) {
    return "Strong momentum here — most initiatives are complete; tidy what remains or capture wins.";
  }
  if (openRoots === 0) {
    return "Everything at the initiative level is done — time to define the next cycle.";
  }
  if (topOpenTitle) {
    const t = topOpenTitle.length > 52 ? `${topOpenTitle.slice(0, 52)}…` : topOpenTitle;
    return `Next focus: “${t}”.`;
  }
  return `${openRoots} open initiative${openRoots !== 1 ? "s" : ""} — align priorities with your vision.`;
}

/**
 * @param {object[]} tasks - tasks in this category (all depths)
 * @param {object|null} profile
 * @param {Date} [now]
 */
export function computeProjectTileMetrics(tasks, profile, now = new Date()) {
  const mode = profile?.preferences?.default_mode || "Strategic Push";
  const inCat = Array.isArray(tasks) ? tasks : [];

  const lastTouchMs = inCat.reduce((acc, t) => {
    const u = t?.updated_at ? new Date(t.updated_at).getTime() : NaN;
    const c = t?.created_at ? new Date(t.created_at).getTime() : NaN;
    const m = Math.max(Number.isFinite(u) ? u : 0, Number.isFinite(c) ? c : 0);
    return Math.max(acc, m);
  }, 0);

  const roots = inCat.filter((t) => !t.parent_task_id);
  const totalRoots = roots.length;

  const openRoots = roots.filter((t) => t.status !== "done" && t.status !== "archived");
  const doneRoots = roots.filter((t) => t.status === "done");
  const doingRoots = roots.filter((t) => t.status === "doing" || t.status === "in_progress");

  const overdue = openRoots.filter((t) => isOverdue(t, now)).length;
  const highOpen = openRoots.filter((t) => isHighPriority(t.priority)).length;

  const doneRatio = totalRoots > 0 ? doneRoots.length / totalRoots : 0;

  const scoredOpen = openRoots.map((t) => {
    const scoring = computeTaskScore(
      { ...t, tags: extractTagNames(t) },
      { mode, now }
    );
    return { ...t, _score: scoring.score };
  });
  scoredOpen.sort((a, b) => b._score - a._score);
  const topOpenTitle = scoredOpen[0]?.title || "";

  let avgOpenNorm = 0;
  if (scoredOpen.length > 0) {
    const sum = scoredOpen.reduce((s, t) => s + t._score, 0);
    const avg = sum / scoredOpen.length;
    // Typical raw scores sit in a moderate band; map into 0–22 for health blend
    avgOpenNorm = Math.max(0, Math.min(22, ((avg - 18) / 45) * 22));
  }

  let health = Math.round(
    26 + doneRatio * 44 + avgOpenNorm - Math.min(overdue * 6, 30) + Math.min(highOpen * 1.2, 8)
  );
  health = Math.max(8, Math.min(98, health));

  if (totalRoots === 0) {
    health = 72;
  }

  const insight = buildInsight({
    overdue,
    highOpen,
    doing: doingRoots.length,
    doneRatio,
    topOpenTitle,
    openRoots: openRoots.length,
    totalRoots,
  });

  return {
    health,
    insight,
    lastActivityAt: lastTouchMs > 0 ? new Date(lastTouchMs).toISOString() : null,
    activityLabel: formatRelativeActivity(lastTouchMs > 0 ? new Date(lastTouchMs) : null),
    openRootCount: openRoots.length,
    totalRootCount: totalRoots,
    overdueCount: overdue,
    /** Featured heuristic: more open work + higher health */
    featuredScore: openRoots.length * Math.sqrt(health + 10),
  };
}
