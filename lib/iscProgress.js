// ISC (Ideal State Criteria) helpers — concrete verification items per
// desired outcome. Borrowed from Daniel Miessler's PAI ISA pattern,
// adapted to our jsonb-soft schema (no migration required).
//
// Schema (lives inside user_profile.profile.desired_outcomes):
//   [{
//     id: "vision-3",
//     title: "Electric Sailboat with Jarvis…",
//     criteria: [
//       { id: "c_xxx", statement: "U-BMS programmed",         met: true,  met_at: "ISO" },
//       { id: "c_yyy", statement: "Motor mount fabricated",   met: false, met_at: null },
//     ]
//   }, ...]
//
// Backward-compatible: outcomes without `criteria` array fall back to the
// pre-ISC behavior (callers should treat them as "no criteria defined").

/** Stable-ish id for a new criterion. Doesn't need to be globally unique. */
export function makeIscId() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Coerce an outcome into a normalized shape. */
export function normalizeOutcome(o) {
  if (!o) return null;
  if (typeof o === "string") return { id: null, title: o, criteria: [] };
  const criteria = Array.isArray(o.criteria) ? o.criteria : [];
  return {
    id: o.id || null,
    title: o.title || "",
    criteria: criteria.map((c) => ({
      id: c.id || makeIscId(),
      statement: c.statement || "",
      met: !!c.met,
      met_at: c.met_at || null,
    })),
  };
}

export function normalizeOutcomes(list) {
  return (list || []).map(normalizeOutcome).filter(Boolean);
}

/**
 * Aggregate progress for a single outcome.
 * @returns {{ total: number, met: number, percent: number }}
 *          percent is 0..100, integer-rounded.
 */
export function outcomeProgress(outcome) {
  const n = normalizeOutcome(outcome);
  const total = n?.criteria?.length || 0;
  if (total === 0) return { total: 0, met: 0, percent: 0 };
  const met = n.criteria.filter((c) => c.met).length;
  return { total, met, percent: Math.round((met / total) * 100) };
}

/**
 * Aggregate progress across a list of outcomes (e.g., the user's full
 * vision, or just the subset linked to a project).
 */
export function outcomesProgress(outcomes) {
  let total = 0;
  let met = 0;
  for (const o of normalizeOutcomes(outcomes)) {
    total += o.criteria.length;
    met += o.criteria.filter((c) => c.met).length;
  }
  return {
    total,
    met,
    percent: total === 0 ? 0 : Math.round((met / total) * 100),
    outcome_count: outcomes?.length || 0,
    outcome_count_with_criteria: (outcomes || []).filter(
      (o) => Array.isArray(o?.criteria) && o.criteria.length > 0
    ).length,
  };
}

/**
 * Filter an outcome list to only those whose ids are in `idList`.
 * Used for "ISCs linked to this project."
 */
export function outcomesByIds(outcomes, idList) {
  if (!Array.isArray(idList) || idList.length === 0) return [];
  const set = new Set(idList);
  return (outcomes || []).filter((o) => o?.id && set.has(o.id));
}

// --- ISC mutation helpers (pure; produce new outcomes arrays) ---

/**
 * Pick the next free `vision-N` id given the current outcome list. Ignores
 * any outcomes whose id doesn't match `vision-<digits>` (third-party / legacy
 * shapes) and starts at vision-0 if none match.
 */
export function nextOutcomeId(outcomes) {
  let max = -1;
  for (const o of outcomes || []) {
    const m = /^vision-(\d+)$/.exec(o?.id || "");
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `vision-${max + 1}`;
}

/**
 * Append a new outcome with an empty criteria list. Returns the new
 * outcomes array AND the freshly minted outcome so callers can surface
 * its auto-generated id without re-scanning.
 */
export function addOutcome(outcomes, title) {
  const trimmed = String(title || "").trim();
  if (!trimmed) return { outcomes: outcomes || [], outcome: null };
  const outcome = {
    id: nextOutcomeId(outcomes),
    title: trimmed,
    criteria: [],
  };
  return { outcomes: [...(outcomes || []), outcome], outcome };
}

export function addIscToOutcome(outcomes, outcomeId, statement) {
  const trimmed = String(statement || "").trim();
  if (!trimmed) return outcomes;
  return (outcomes || []).map((o) =>
    o.id === outcomeId
      ? {
          ...o,
          criteria: [
            ...(Array.isArray(o.criteria) ? o.criteria : []),
            { id: makeIscId(), statement: trimmed, met: false, met_at: null },
          ],
        }
      : o
  );
}

export function setIscMet(outcomes, outcomeId, iscId, met) {
  const nowIso = met ? new Date().toISOString() : null;
  return (outcomes || []).map((o) => {
    if (o.id !== outcomeId) return o;
    return {
      ...o,
      criteria: (o.criteria || []).map((c) =>
        c.id === iscId ? { ...c, met: !!met, met_at: met ? nowIso : null } : c
      ),
    };
  });
}

export function updateIscStatement(outcomes, outcomeId, iscId, statement) {
  const trimmed = String(statement || "").trim();
  return (outcomes || []).map((o) => {
    if (o.id !== outcomeId) return o;
    return {
      ...o,
      criteria: (o.criteria || []).map((c) =>
        c.id === iscId ? { ...c, statement: trimmed } : c
      ),
    };
  });
}

export function removeIsc(outcomes, outcomeId, iscId) {
  return (outcomes || []).map((o) => {
    if (o.id !== outcomeId) return o;
    return { ...o, criteria: (o.criteria || []).filter((c) => c.id !== iscId) };
  });
}
