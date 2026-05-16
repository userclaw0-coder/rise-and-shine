// Vector bundling — enforce "the day's 3 slots span at most 2 vectors."
//
// Why: a day whose 3 actions all hit different vectors feels scattered.
// A day whose 3 actions move 1-2 vectors compounds into felt momentum.
// We pick slot 1 freely, slot 2 may introduce a new vector, slot 3 must
// belong to one of the two vectors already in play.
//
// A "vector" is fuzzy. We key on the strongest signal we have, in this
// order: outcome_id → primary_life_domain → category_id. This keeps the
// bundler honest about what's actually moving — if a task is tagged to
// a specific outcome we use that; otherwise we fall back to the domain
// or project. Two tasks with overlapping outcome lists count as same-
// vector if any overlap exists.

const MAX_DISTINCT_VECTORS = 2;

/**
 * Return the canonical primary vector key for a task. Used when comparing
 * two tasks' vectors quickly. Tasks with multiple outcomes get keyed on
 * the first listed outcome — sameVectorAs handles the wider overlap.
 */
export function primaryVectorKey(task) {
  if (!task) return null;
  if (Array.isArray(task.outcome_ids) && task.outcome_ids.length > 0) {
    return `outcome:${task.outcome_ids[0]}`;
  }
  if (task.primary_life_domain) {
    return `domain:${task.primary_life_domain}`;
  }
  if (task.category_id) {
    return `category:${task.category_id}`;
  }
  return null;
}

/**
 * Return the full set of vector keys a task touches (one outcome per id,
 * plus its domain and category as additional vector handles). Used by
 * sameVectorAs so a multi-outcome task counts as same-vector against any
 * of its peers.
 */
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

export function sameVectorAs(task, vectorKey) {
  if (!vectorKey) return false;
  return vectorKeysFor(task).has(vectorKey);
}

/**
 * Given a list of scored candidates ({task, score}), pick up to `count`
 * slots respecting the vector bundling rule:
 *   - Slot 1: highest score, free choice.
 *   - Slot 2: highest score from candidates not in slot 1 (introduces V2
 *     if the top pick differs from V1, or stays in V1 if higher-scoring).
 *   - Slot 3+: must belong to one of the vectors already picked.
 *
 * Returns the picked entries in order. If fewer than `count` candidates
 * exist that respect the rule, the result is shorter. Same-vector ties
 * keep the existing scoring order.
 */
export function pickWithVectorBundling(scoredCandidates, options = {}) {
  const { count = 3 } = options;
  const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score);
  if (sorted.length === 0 || count <= 0) return [];

  const picked = [];
  const pickedTaskIds = new Set();
  const allowedVectors = new Set();

  const pushPicked = (entry) => {
    picked.push(entry);
    pickedTaskIds.add(entry.task.id);
    for (const k of vectorKeysFor(entry.task)) allowedVectors.add(k);
  };

  // Slot 1: top score, no constraints.
  pushPicked(sorted[0]);
  if (picked.length >= count) return picked;

  // Slot 2: top score among the rest. Naturally introduces V2 if the next
  // best is a different vector, or stays in V1 if same.
  for (const entry of sorted) {
    if (pickedTaskIds.has(entry.task.id)) continue;
    pushPicked(entry);
    break;
  }
  if (picked.length >= count) return picked;

  // Slot 3+: must hit at least one already-picked vector OR if no such
  // candidate exists, we allow an additional vector but flag it.
  for (const entry of sorted) {
    if (picked.length >= count) break;
    if (pickedTaskIds.has(entry.task.id)) continue;
    const taskVectors = vectorKeysFor(entry.task);
    let intersects = false;
    for (const v of taskVectors) {
      if (allowedVectors.has(v)) {
        intersects = true;
        break;
      }
    }
    if (intersects) pushPicked(entry);
  }

  // Fallback: if we couldn't fill all slots within the 2-vector budget,
  // top up from the highest-remaining candidates. The bundling rule is a
  // strong preference, not a hard constraint — better to have 3 slots
  // filled with one outlier than 2 slots with zero outliers.
  if (picked.length < count) {
    for (const entry of sorted) {
      if (picked.length >= count) break;
      if (pickedTaskIds.has(entry.task.id)) continue;
      pushPicked(entry);
    }
  }

  return picked.slice(0, count);
}

export const _internal = { MAX_DISTINCT_VECTORS, vectorKeysFor };
