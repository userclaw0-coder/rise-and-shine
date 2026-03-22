/**
 * Occam schedule: completion-based rotation with mandatory recovery after each heavy session.
 * Missed days keep the same workout due until logged; next heavy session unlocks after MIN_RECOVERY_HOURS.
 */

import { OCCAM_WORKOUTS } from "./occam";

export const MIN_RECOVERY_HOURS = 48;
export const IDEAL_RECOVERY_HOURS = 72;

const MIN_RECOVERY_MS = MIN_RECOVERY_HOURS * 60 * 60 * 1000;

const TASK_SHELL = {
  "Occam A": {
    id: "workout-occam-a",
    title: "Occam Protocol — Workout A",
    priority: "High",
    tags: ["workout", "occam", "strength"],
  },
  "Occam B": {
    id: "workout-occam-b",
    title: "Occam Protocol — Workout B",
    priority: "High",
    tags: ["workout", "occam", "strength"],
  },
  Recovery: {
    id: "workout-recovery",
    title: "Recovery — walk, stretch, light mobility",
    priority: "Medium",
    tags: ["workout", "recovery", "occam"],
  },
};

/** Best-effort: logged exercise string matches template exercise (logName, aliases, name prefix). */
export function exerciseNameMatchesOccamLog(exerciseName, ex) {
  const n = (exerciseName || "").toLowerCase().trim();
  if (!n || !ex) return false;
  const needles = [ex.logName, ...(ex.logAliases || [])]
    .map((s) => (s || "").toLowerCase().trim())
    .filter(Boolean);
  for (const needle of needles) {
    if (n.includes(needle)) return true;
  }
  const prefix = (ex.name || "").toLowerCase().slice(0, 8);
  return prefix.length >= 3 && n.includes(prefix);
}

/** True if logged sets cover every main lift for the phase (same rules as health page). */
export function occamSessionLooksComplete(setsOnDate, phase) {
  const plan = OCCAM_WORKOUTS[phase];
  if (!plan || !plan.exercises?.length) return false;
  const logged = (setsOnDate || []).map((s) => (s.exercise || "").toLowerCase());
  return plan.exercises.every((ex) =>
    logged.some((n) => exerciseNameMatchesOccamLog(n, ex))
  );
}

function maxCreatedAt(sets) {
  let t = 0;
  for (const s of sets || []) {
    const raw = s.created_at;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isNaN(ms) && ms > t) t = ms;
  }
  return t > 0 ? new Date(t) : null;
}

/**
 * From lifting_sets rows (with session), find most recent session that fully completed A or B.
 * Prefers B over A if both somehow complete same day.
 */
export function inferLatestOccamCompletionFromSets(rows) {
  if (!rows?.length) return null;
  const byDate = new Map();
  for (const row of rows) {
    const sd = row.session?.session_date;
    if (!sd) continue;
    if (!byDate.has(sd)) byDate.set(sd, []);
    byDate.get(sd).push(row);
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  for (const d of dates) {
    const sets = byDate.get(d);
    const phases = ["Occam B", "Occam A"];
    for (const phase of phases) {
      if (occamSessionLooksComplete(sets, phase)) {
        const at = maxCreatedAt(sets) || new Date(`${d}T12:00:00`);
        return { phase, session_date: d, completedAt: at };
      }
    }
  }
  return null;
}

function normalizePrefsCompletion(p) {
  if (!p || !p.phase || !p.completed_at) return null;
  const at = new Date(p.completed_at);
  if (Number.isNaN(at.getTime())) return null;
  return {
    phase: p.phase === "Occam B" ? "Occam B" : "Occam A",
    session_date: p.session_date || at.toISOString().slice(0, 10),
    completedAt: at,
  };
}

function pickNewerCompletion(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a.completedAt.getTime() >= b.completedAt.getTime() ? a : b;
}

/**
 * Current schedule: Recovery until 48h after last full Occam session; then alternating A/B due until completed.
 */
export function getOccamScheduleState({ preferences, setsWithSession, now = new Date() }) {
  const fromSets = inferLatestOccamCompletionFromSets(setsWithSession || []);
  const fromPrefs = normalizePrefsCompletion(preferences?.occam_schedule?.last_completion);
  const last = pickNewerCompletion(fromSets, fromPrefs);

  if (!last) {
    return {
      phase: "Occam A",
      mode: "workout",
      dueWorkout: "Occam A",
      recoveryEndsAt: null,
      lastCompletion: null,
      hoursUntilEligible: 0,
      nextWorkoutAfterRecovery: null,
    };
  }

  const nextWorkout = last.phase === "Occam A" ? "Occam B" : "Occam A";
  const recoveryEndsAt = new Date(last.completedAt.getTime() + MIN_RECOVERY_MS);

  if (now < recoveryEndsAt) {
    return {
      phase: "Recovery",
      mode: "recovery",
      dueWorkout: nextWorkout,
      recoveryEndsAt,
      lastCompletion: last,
      hoursUntilEligible: (recoveryEndsAt - now) / 3600000,
      nextWorkoutAfterRecovery: nextWorkout,
    };
  }

  return {
    phase: nextWorkout,
    mode: "workout",
    dueWorkout: nextWorkout,
    recoveryEndsAt: null,
    lastCompletion: last,
    hoursUntilEligible: 0,
    nextWorkoutAfterRecovery: null,
  };
}

/**
 * Same shape as legacy getWorkoutPlanForDate plus schedule metadata.
 */
export function buildWorkoutPlanForPhase(phase, dateStr, scheduleState = null) {
  const shell = TASK_SHELL[phase];
  if (!shell) return null;
  const ow = OCCAM_WORKOUTS[phase];
  const occamLabel =
    ow?.label ||
    (phase === "Recovery"
      ? "Active recovery (between Occam sessions)"
      : null);

  return {
    id: `workout-${dateStr}`,
    phase,
    title: shell.title,
    priority: shell.priority,
    tags: shell.tags,
    exercises: ow?.exercises || [],
    occamLabel,
    scheduleMode: scheduleState?.mode ?? null,
    recoveryEndsAt: scheduleState?.recoveryEndsAt ?? null,
    dueWorkout: scheduleState?.dueWorkout ?? phase,
    lastOccamCompletion: scheduleState?.lastCompletion ?? null,
    hoursUntilEligible: scheduleState?.hoursUntilEligible ?? 0,
    nextWorkoutAfterRecovery: scheduleState?.nextWorkoutAfterRecovery ?? null,
  };
}

export function getWorkoutPlanForSchedule(dateStr, ctx) {
  const state = getOccamScheduleState({
    preferences: ctx?.preferences,
    setsWithSession: ctx?.setsWithSession || [],
    now: ctx?.now || new Date(),
  });
  return buildWorkoutPlanForPhase(state.phase, dateStr, state);
}

/** Best-effort match of exercise name to template exercise. */
export function setMatchesOccamExercise(exerciseName, ex) {
  return exerciseNameMatchesOccamLog(exerciseName, ex);
}

/**
 * Latest top set for a template exercise (by session date, then created_at).
 */
export function getLastTopSetForOccamExercise(setsWithSession, ex) {
  const rows = (setsWithSession || [])
    .filter((r) => r.session?.session_date && setMatchesOccamExercise(r.exercise, ex))
    .sort((a, b) => {
      const da = a.session.session_date;
      const db = b.session.session_date;
      if (da !== db) return da < db ? 1 : da > db ? -1 : 0;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  const r = rows[0];
  if (!r) return null;
  const w = r.weight != null ? Number(r.weight) : null;
  const reps = r.reps != null ? Number(r.reps) : null;
  if (w != null && Number.isNaN(w)) return null;
  if (reps != null && Number.isNaN(reps)) return null;
  return {
    weight: w,
    reps,
    session_date: r.session.session_date,
  };
}

/**
 * Occam-style progression hint from last performance.
 */
export function suggestOccamWeight(weight, reps, targetRepsLabel) {
  if (weight == null || reps == null) return null;
  const w = Number(weight);
  const r = Number(reps);
  if (Number.isNaN(w) || Number.isNaN(r)) return null;

  if (String(targetRepsLabel).includes("75")) {
    return {
      nextWeight: w,
      text: "Total reps matter more than load — add reps before bumping weight on swings.",
    };
  }

  const minReps = String(targetRepsLabel).includes("10") ? 10 : 7;

  if (r >= minReps + 2) {
    return {
      nextWeight: Math.round((w + 5) * 10) / 10,
      text: `You cleared ${minReps}+ with margin — try ${Math.round((w + 5) * 10) / 10} lb next heavy session (add load when reps exceed target).`,
    };
  }
  if (r >= minReps) {
    return {
      nextWeight: Math.round((w + 2.5) * 10) / 10,
      text: `At target reps — nudge to ${Math.round((w + 2.5) * 10) / 10} lb if tempo stayed honest, or repeat ${w} lb.`,
    };
  }
  if (r >= minReps - 1) {
    return {
      nextWeight: w,
      text: `Edge of range — repeat ${w} lb until you solidly hit ${minReps}+ with strict 5/5.`,
    };
  }
  return {
    nextWeight: Math.max(0, Math.round((w - 5) * 10) / 10),
    text: `Below target — keep ${w} lb or reduce slightly; own the eccentric.`,
  };
}

/** Group sets by session_date for calendar cells. */
export function groupSetsBySessionDate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sd = row.session?.session_date;
    if (!sd) continue;
    if (!map.has(sd)) map.set(sd, []);
    map.get(sd).push(row);
  }
  return map;
}
