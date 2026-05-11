/**
 * Browser notification copy + eligibility for Occam workouts.
 * Uses the same schedule rules as lib/occamSchedule.js (heavy session due, not yet logged today).
 */

import {
  getOccamScheduleState,
  occamSessionLooksComplete,
} from "./occamSchedule.js";

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function workoutShortLabel(dueWorkout) {
  if (dueWorkout === "Occam A") return "Workout A (row & press)";
  if (dueWorkout === "Occam B") return "Workout B (bench & squat)";
  return dueWorkout || "Occam session";
}

/**
 * When a heavy Occam session is due (not in recovery) and not fully logged for local today.
 * @returns {{ title: string, body: string, dedupeKey: string } | null}
 */
export function getOccamDueNotificationPayload({
  preferences,
  setsWithSession,
  now = new Date(),
}) {
  const dateStr = localDateStr(now);
  const state = getOccamScheduleState({
    preferences,
    setsWithSession: setsWithSession || [],
    now,
  });

  if (state.mode !== "workout" || !state.dueWorkout) {
    return null;
  }

  const setsToday = (setsWithSession || []).filter(
    (r) => r.session?.session_date === dateStr
  );

  if (occamSessionLooksComplete(setsToday, state.dueWorkout)) {
    return null;
  }

  const short = workoutShortLabel(state.dueWorkout);
  return {
    title: "Occam workout due",
    body: `${short} is ready to log. Open Occam Workout when you’re set.`,
    dedupeKey: `occam-due-${dateStr}-${state.dueWorkout}`,
  };
}

export const OCCAM_NOTIFY_STORAGE_ENABLED = "rs_occam_notify_enabled";
export const OCCAM_NOTIFY_STORAGE_DEDUPE = "rs_occam_notify_last_dedupe";
export const OCCAM_NOTIFY_CHANGED_EVENT = "rs-occam-notify-changed";
