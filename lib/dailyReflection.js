// Read recent end-of-day reflections and aggregate them into activation-
// energy adjustments per vector. Patterns that repeatedly "felt hard" get
// an AE penalty so the system stops surfacing the same hard wall; patterns
// that "felt easy" get a small AE boost so they keep flowing.
//
// We aggregate at the vector level (outcome / domain / category) rather
// than per-task because individual tasks come and go but the *kind* of
// work tends to persist. Adjustments decay over time — a hard week from
// 30 days ago shouldn't dominate today's ranking.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOOKBACK_DAYS = 30;
const HALF_LIFE_DAYS = 14;
const MAX_ABS_ADJUST = 8;

function daysAgo(dateStr, todayStr) {
  if (!dateStr || !todayStr) return 0;
  const a = new Date(dateStr);
  const b = new Date(todayStr);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function decayWeight(daysOld) {
  // Exponential half-life — recent reflections weigh more.
  return Math.pow(0.5, daysOld / HALF_LIFE_DAYS);
}

function vectorKeysFor(task) {
  const keys = new Set();
  if (Array.isArray(task?.outcome_ids)) {
    for (const id of task.outcome_ids) {
      if (id) keys.add(`outcome:${id}`);
    }
  }
  if (task?.primary_life_domain) keys.add(`domain:${task.primary_life_domain}`);
  if (task?.category_id) keys.add(`category:${task.category_id}`);
  return keys;
}

/**
 * Build a Map<vector_key, number> of AE adjustments learned from recent
 * reflections. Positive = vector tends to feel hard (raise its AE,
 * penalizing the score); negative = vector tends to feel easy (lower
 * AE, slight boost). Bounded ±MAX_ABS_ADJUST.
 *
 * `today` is YYYY-MM-DD; defaults to now in UTC.
 */
export async function buildAeAdjustments(userId, today = null) {
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data: plans, error } = await supabase
    .from("daily_plans")
    .select("date, queue, reflection")
    .eq("user_id", userId)
    .gte("date", cutoff)
    .not("reflection", "is", null);
  if (error || !plans?.length) return new Map();

  // Collect all task_ids referenced by reflected slots so we can look up
  // their vector keys in one shot.
  const taskIds = new Set();
  for (const p of plans) {
    const q = Array.isArray(p.queue) ? p.queue : [];
    for (const slot of q) {
      if (slot?.task_id) taskIds.add(slot.task_id);
    }
  }
  let taskRows = [];
  if (taskIds.size > 0) {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, outcome_ids, primary_life_domain, category_id")
      .in("id", Array.from(taskIds));
    taskRows = rows || [];
  }
  const taskMap = new Map(taskRows.map((t) => [t.id, t]));

  // Per-vector weighted accumulator.
  const accum = new Map(); // vector_key → {sum, weight}
  const bump = (key, value, weight) => {
    if (!key) return;
    const cur = accum.get(key) || { sum: 0, weight: 0 };
    cur.sum += value * weight;
    cur.weight += weight;
    accum.set(key, cur);
  };

  for (const plan of plans) {
    const entries = Array.isArray(plan.reflection?.entries)
      ? plan.reflection.entries
      : [];
    const q = Array.isArray(plan.queue) ? plan.queue : [];
    const dWeight = decayWeight(daysAgo(plan.date, todayStr));
    for (const entry of entries) {
      const slot = q.find((s) => s?.slot === entry?.slot);
      if (!slot) continue;
      const task = taskMap.get(slot.task_id);
      const keys = task
        ? vectorKeysFor(task)
        : // Invented slot — key on its embedded vector_key if present.
          slot.invented?.vector_key
        ? new Set([slot.invented.vector_key])
        : new Set();
      // Positive value = hard; negative = easy; landed=false is itself a
      // mild hard signal because the user didn't get to it.
      let value = 0;
      if (entry.felt === "hard") value = 2;
      else if (entry.felt === "easy") value = -2;
      if (entry.landed === false) value += 1.5;
      if (value === 0) continue;
      for (const k of keys) bump(k, value, dWeight);
    }
  }

  const out = new Map();
  for (const [key, { sum, weight }] of accum.entries()) {
    if (weight === 0) continue;
    const raw = sum / weight;
    const clamped = Math.max(
      -MAX_ABS_ADJUST,
      Math.min(MAX_ABS_ADJUST, Math.round(raw * 2))
    );
    if (clamped !== 0) out.set(key, clamped);
  }
  return out;
}

export const _internal = {
  vectorKeysFor,
  decayWeight,
  daysAgo,
  LOOKBACK_DAYS,
  HALF_LIFE_DAYS,
  MAX_ABS_ADJUST,
};
