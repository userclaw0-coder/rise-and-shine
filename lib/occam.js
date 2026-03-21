/**
 * Tim Ferriss / 4-Hour Body — Occam’s Protocol (condensed for in-app use).
 * Not medical advice. User should verify exercise selection with a coach.
 *
 * This app uses a **home free-weight** template: barbell + EZ bar, no machines.
 * Core ideas: minimal sessions, 5/5 cadence, one working set to failure (7+ reps
 * on most lifts; squat often 7–10 with strict tempo).
 */

export const OCCAM_CADENCE_SHORT = "5/5 cadence — 5 sec up, 5 sec down";
export const OCCAM_PROTOCOL_BLURB =
  "One set to failure per main lift after warm-up. When you exceed target reps, add weight next session. Diet and sleep drive most of the result.";

/** Workout definitions keyed by phase names used in WORKOUT_PATTERN */
export const OCCAM_WORKOUTS = {
  "Occam A": {
    label: "Workout A — Row & press (home barbell)",
    exercises: [
      {
        key: "yates_row",
        name: "Yates row with EZ bar",
        logName: "Yates Row",
        logAliases: ["ez bar row", "barbell row", "bent over row"],
        targetReps: "7+",
        detail: "One top set to failure after warm-ups; chest-supported or strict hinge per your setup",
        focus: "Upper back & lats",
        protocolTip:
          "5/5 tempo — control the stretch; no heaving. If the EZ bar isn’t available, use a barbell with the same angle and log it as “Yates Row”.",
        tipVariant: "cadence",
      },
      {
        key: "barbell_press",
        name: "Shoulder-width barbell press",
        logName: "Barbell Press",
        logAliases: ["overhead press", "ohp", "shoulder press", "military press"],
        targetReps: "7+",
        detail: "Standing or seated; shoulder-width grip, strict lockout",
        focus: "Shoulders & triceps",
        protocolTip:
          "Target failure in the 7–10 rep window. Brace hard; if reps collapse before tempo breaks, repeat the same weight.",
        tipVariant: "range",
      },
    ],
    optional: ["Face pulls / band pull-aparts", "Light walks between sessions"],
  },
  "Occam B": {
    label: "Workout B — Bench & squat (home)",
    exercises: [
      {
        key: "incline_bench",
        name: "Slight incline shoulder-width bench press",
        logName: "Incline Bench",
        logAliases: ["incline press", "incline bench press"],
        targetReps: "7+",
        detail: "Primary driver for your 1× bodyweight bench goal",
        focus: "Upper chest & anterior delt",
        protocolTip:
          "Small incline (15–30°), shoulder-width grip, 5/5 cadence — pause lightly on the chest, no bounce.",
        tipVariant: "cadence",
      },
      {
        key: "squat",
        name: "Squat",
        logName: "Squat",
        logAliases: ["back squat", "front squat"],
        targetReps: "7+",
        detail: "Back or front squat — tracks toward your 2× bodyweight squat-side goal",
        focus: "Quads & hips",
        protocolTip:
          "Depth you own with a neutral spine. Occam-style: one hard set; if you clear 7+ with margin, add load next time.",
        tipVariant: "range",
      },
    ],
    optional: [],
  },
};

/** Map logged exercise strings to goal tracking (bench 1×BW, squat 2×BW) */
export function classifyLiftForGoals(exerciseName) {
  const ex = (exerciseName || "").toLowerCase();
  const countsForBench =
    ex.includes("bench") ||
    (ex.includes("incline") && ex.includes("press")) ||
    (ex.includes("decline") && ex.includes("press"));
  const countsForSquatLike =
    ex.includes("squat") || ex.includes("leg press") || ex.includes("hack squat");
  return { countsForBench, countsForSquatLike };
}

export function getOccamWorkout(phase) {
  return OCCAM_WORKOUTS[phase] || null;
}
