/**
 * Tim Ferriss / 4-Hour Body — Occam’s Protocol (condensed for in-app use).
 * Not medical advice. User should verify exercise selection with a coach.
 *
 * Core ideas: minimal sessions, 5/5 cadence, one working set to failure (7+ reps
 * on most lifts; leg press often programmed ~10; swings for high-rep finish).
 */

export const OCCAM_CADENCE_SHORT = "5/5 cadence — 5 sec up, 5 sec down";
export const OCCAM_PROTOCOL_BLURB =
  "One set to failure per main lift after warm-up. When you exceed target reps, add weight next session. Diet and sleep drive most of the result.";

/** Workout definitions keyed by phase names used in WORKOUT_PATTERN */
export const OCCAM_WORKOUTS = {
  "Occam A": {
    label: "Workout A — Pull & press",
    exercises: [
      {
        key: "pulldown",
        name: "Close-grip supinated pull-down",
        logName: "Pull-down",
        targetReps: "7+",
        detail: "One set to failure after warm-up sets",
        focus: "Lats & elbow flexors",
        protocolTip:
          "Maintain 5s ascent / 5s descent. No momentum at the turnaround — treat the negative as the main event.",
        tipVariant: "cadence",
      },
      {
        key: "shoulder_press",
        name: "Shoulder press (machine or safe alternative)",
        logName: "Shoulder Press",
        targetReps: "7+",
        detail: "Same 5/5 tempo; stop before compromising form",
        focus: "Anterior & medial delts",
        protocolTip:
          "Target failure in the 7–10 rep range after warm-ups. If you’re short, reduce load before breaking tempo.",
        tipVariant: "range",
      },
    ],
    optional: ["Myotatic crunch", "Optional neck / mobility"],
  },
  "Occam B": {
    label: "Workout B — Push & legs & swings",
    exercises: [
      {
        key: "bench",
        name: "Slight incline or decline bench press",
        logName: "Bench Press",
        targetReps: "7+",
        detail: "Primary driver for your 1× bodyweight bench goal",
        focus: "Upper chest & anterior delt",
        protocolTip:
          "5/5 cadence — no bounce off the chest. When you exceed target reps cleanly, add a small plate next session.",
        tipVariant: "cadence",
      },
      {
        key: "leg_press",
        name: "Leg press",
        logName: "Leg Press",
        targetReps: "10",
        detail: "Occam often uses 10 reps here; tracks toward leg strength goals",
        focus: "Quads & hips (2× BW anchor)",
        protocolTip:
          "Occam often programs ~10 reps here. Full ROM, constant tension — leg press counts toward your squat-side goal.",
        tipVariant: "range",
      },
      {
        key: "swings",
        name: "Kettlebell swings",
        logName: "Kettlebell Swings",
        targetReps: "75+",
        detail: "Pick a weight you can move with crisp form; total reps matter",
        focus: "Posterior chain finisher",
        protocolTip:
          "Hinge, don’t squat the bell. Chase crisp reps; total volume matters more than max load.",
        tipVariant: "volume",
      },
    ],
    optional: [],
  },
};

/** Map logged exercise strings to goal tracking (bench 1×BW, squat/leg 2×BW) */
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
