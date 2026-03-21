# Occam Protocol (Tim Ferriss–style) in Rise & Shine

This app implements a **minimal two-workout rotation** inspired by Occam’s Protocol (slow cadence, few exercises, infrequent sessions, progressive overload). It is **not** a medical prescription—adjust with a coach or physician as needed.

## Schedule engine (shared with Today)

**Completion-based rotation** (`lib/occamSchedule.js`), not a fixed calendar:

1. **First heavy session** defaults to **Occam A** if you have no logged history.
2. After a session is recognized as a **complete** Occam A or B (every main lift for that template logged on a `lifting_sessions` date), the app records `preferences.occam_schedule.last_completion` (synced on Health load when lifts imply a newer completion than stored).
3. **48-hour minimum recovery** (`MIN_RECOVERY_HOURS`): until that window ends, **Today** and **Health** show **Recovery** (mobility / light day). The **next** workout (A ↔ B) is shown as upcoming.
4. After recovery, the **next** workout stays **due** until you log it—**missed calendar days do not skip** the assignment.
5. Completing that workout starts another **48h** recovery before the following heavy day.

Legacy **fixed calendar** cycle still exists in `lib/scoring.js` (`WORKOUT_CYCLE_START` / `getWorkoutPhaseForDate`) for callers that omit schedule context. **Today** and **Health** pass `preferences` + `lifting_sets` data into `getWorkoutPlanForDate(date, ctx)` so they use the engine above.

## Workout A

- Close-grip supinated pull-down (or equivalent pull)
- Shoulder press  
Target **7+ reps** on the top set after warm-ups; **5 sec up / 5 sec down** on working reps.

## Workout B

- Incline or decline bench press
- Leg press (counts toward the **2× bodyweight “squat-side”** goal in-app)
- Kettlebell swings (**75+** total in a session when following the template)

## Logging & goals

- **Bench goal:** working weight vs **1×** latest logged body weight (bench / incline / decline patterns in `lib/occam.js`).
- **Squat-side goal:** **2×** body weight vs best **squat or leg press** logged.
- **Measurements:** `user_profile.profile.preferences.occam_measurements` (chest, waist, hips, shoulders, neck + `measured_at`).
- **Progression hints:** `suggestOccamWeight` in `lib/occamSchedule.js` — add load when reps exceed target, repeat when at the edge, per Occam-style rules.

## UI

- **Health (`/health`):** month calendar (logged exercises per day, today + next-eligible highlights), Stitch-style engine (tabs A/B, exercise cards, cadence pill), sidebar rings, morphology, recovery vector, celebrations.
- **Today:** same plan via `getWorkoutPlanForDate` + context; recovery copy when applicable.

## Similar tools

Apps like **Strong**, **Hevy**, and **Jefit** excel at set/rep logging; this page keeps Occam-specific structure, recovery spacing, and Today alignment in one place.
