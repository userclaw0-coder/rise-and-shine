# Occam Protocol (Tim Ferriss–style) in Rise & Shine

This app implements a **minimal two-workout rotation** inspired by Occam’s Protocol (slow cadence, few exercises, infrequent sessions, progressive overload). It is **not** a medical prescription—adjust with a coach or physician as needed.

The default template is **home free-weight** (barbell + EZ bar, no machines). See `lib/occam.js` for exercise names and logging hints.

## Schedule engine (shared with Today)

**Completion-based rotation** (`lib/occamSchedule.js`), not a fixed calendar:

1. **First heavy session** defaults to **Occam A** if you have no logged history.
2. After a session is recognized as a **complete** Occam A or B (every main lift for that template logged on a `lifting_sessions` date), the app records `preferences.occam_schedule.last_completion` (synced on Health load when lifts imply a newer completion than stored).
3. **48-hour minimum recovery** (`MIN_RECOVERY_HOURS`): until that window ends, **Today** and **Health** show **Recovery** (mobility / light day). The **next** workout (A ↔ B) is shown as upcoming.
4. After recovery, the **next** workout stays **due** until you log it—**missed calendar days do not skip** the assignment.
5. Completing that workout starts another **48h** recovery before the following heavy day.

Legacy **fixed calendar** cycle still exists in `lib/scoring.js` (`WORKOUT_CYCLE_START` / `getWorkoutPhaseForDate`) for callers that omit schedule context. **Today** and **Health** pass `preferences` + `lifting_sets` data into `getWorkoutPlanForDate(date, ctx)` so they use the engine above.

## Workout A (home)

- **Yates row with EZ bar** (log as “Yates Row” or include those words)
- **Shoulder-width barbell press** (log as “Barbell Press” or similar)

Target **7+ reps** on the top set after warm-ups; **5 sec up / 5 sec down** on working reps.

## Workout B (home)

- **Slight incline shoulder-width bench press** (log as “Incline Bench” or include incline + bench)
- **Squat** (back or front)

Target **7+** on bench; squat toward **7+** with strict form (adjust if you prefer a fixed 8–10 cap).

## Logging & goals

- **Bench goal:** working weight vs **1×** latest logged body weight (bench / incline / decline patterns in `lib/occam.js`).
- **Squat-side goal:** **2×** body weight vs best **squat** logged.
- **Measurements:** `user_profile.profile.preferences.occam_measurements` (chest, waist, hips, shoulders, neck, left_bicep, left_quad, left_calf + `measured_at`).
- **Progression hints:** `suggestOccamWeight` in `lib/occamSchedule.js` — add load when reps exceed target, repeat when at the edge, per Occam-style rules.

## UI

- **Health (`/health`):** month calendar, Occam engine tabs, exercise cards, goals, morphology, recovery.
- **Today:** progress + Occam side-by-side on wide screens.

## Similar tools

Apps like **Strong**, **Hevy**, and **Jefit** excel at set/rep logging; this page keeps Occam-specific structure, recovery spacing, and Today alignment in one place.
