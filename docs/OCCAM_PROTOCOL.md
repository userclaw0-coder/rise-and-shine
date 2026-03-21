# Occam Protocol (Tim Ferriss–style) in Rise & Shine

This app implements a **minimal two-workout rotation** inspired by the Occam’s Protocol (slow cadence, few exercises, infrequent sessions, progressive overload). It is **not** a medical prescription—adjust with a coach or physician as needed.

## Cycle (shared with Today)

Phases repeat in order: **Occam A → Recovery → Occam B → Recovery**, anchored to a fixed cycle start in `lib/scoring.js`. **Today** shows the phase, exercise list, cadence reminder, checkbox to mark the daily workout task complete, and a link to **`/health`** for logging.

## Workout A

- Close-grip supinated pull-down (or equivalent pull)
- Shoulder press  
Target **7+ reps** on the top set after warm-ups; **5 sec up / 5 sec down** on working reps.

## Workout B

- Incline or decline bench press
- Leg press (counts toward the **2× bodyweight “squat-side”** goal in-app)
- Kettlebell swings (**75+** total in a session when following the template)

## Logging & goals

- **Bench goal:** working weight vs **1×** latest logged body weight (flat/incline/decline bench and similar patterns match in `lib/occam.js`).
- **Squat-side goal:** **2×** body weight vs best **squat or leg press** logged (Occam often uses leg press instead of barbell squat).
- **Measurements:** stored under `user_profile.profile.preferences.occam_measurements` (chest, waist, hips, shoulders, neck + `measured_at`).

## Similar tools

Apps like **Strong**, **Hevy**, and **Jefit** excel at set/rep logging; this page keeps Occam-specific copy, goals, and Today alignment in one place.
