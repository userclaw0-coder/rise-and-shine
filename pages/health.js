import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
import OccamMonthCalendar from "../components/OccamMonthCalendar";
import OccamNotifySettings from "../components/OccamNotifySettings";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import {
  getBodyWeightLogs,
  insertBodyWeightLog,
  getLiftingSessions,
  createLiftingSession,
  getLiftingSets,
  getLiftingSetsWithSession,
  addLiftingSet,
  getUserProfile,
  upsertUserProfile,
} from "../lib/db";
import {
  OCCAM_CADENCE_SHORT,
  OCCAM_PROTOCOL_BLURB,
  OCCAM_WORKOUTS,
  classifyLiftForGoals,
} from "../lib/occam";
import {
  MIN_RECOVERY_HOURS,
  IDEAL_RECOVERY_HOURS,
  buildWorkoutPlanForPhase,
  getOccamScheduleState,
  groupSetsBySessionDate,
  inferLatestOccamCompletionFromSets,
  occamSessionLooksComplete,
  getLastTopSetForOccamExercise,
  suggestOccamWeight,
} from "../lib/occamSchedule";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDateStr(isoOrDate) {
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function deriveBestsFromSets(rows) {
  let bench = null;
  let squatLike = null;
  for (const row of rows || []) {
    const w = row.weight != null ? Number(row.weight) : null;
    if (w == null || Number.isNaN(w)) continue;
    const { countsForBench, countsForSquatLike } = classifyLiftForGoals(row.exercise);
    if (countsForBench) bench = bench == null ? w : Math.max(bench, w);
    if (countsForSquatLike) squatLike = squatLike == null ? w : Math.max(squatLike, w);
  }
  return { bestBenchLb: bench, bestSquatLb: squatLike };
}

function setsForSessionDate(rows, dateStr) {
  return (rows || []).filter((r) => {
    const sd = r.session?.session_date;
    return sd === dateStr;
  });
}

const MEASURE_DEFAULTS = {
  chest_in: "",
  waist_in: "",
  hips_in: "",
  shoulders_in: "",
  neck_in: "",
  left_bicep_in: "",
  left_quad_in: "",
  left_calf_in: "",
};

const CHART_COLORS = [
  "#6b5500",
  "#555d1e",
  "#d4af37",
  "#7f5c53",
  "#4a3d00",
  "#6b7530",
];

function OccamGoalRing({ pct, title, sub, detail }) {
  const uid = useId();
  const gradId = `occam-ring-grad-${uid}`;
  const p = pct == null ? null : Math.min(100, Math.max(0, Number(pct)));
  const r = 38;
  const c = 2 * Math.PI * r;
  const off = p == null ? c : c - (p / 100) * c;
  return (
    <div className="rs-occam-ring">
      <div className="rs-occam-ring__svg-wrap">
        <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke="rgba(186,177,159,0.22)"
            strokeWidth="7"
          />
          {p != null && (
            <circle
              cx="56"
              cy="56"
              r={r}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={off}
              transform="rotate(-90 56 56)"
            />
          )}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--rs-primary-strong)" />
              <stop offset="100%" stopColor="var(--rs-accent-gold)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="rs-occam-ring__overlay">
          <span className="rs-occam-ring__pct">{p != null ? `${Math.round(p)}%` : "—"}</span>
          <span className="rs-occam-ring__lbl">{title}</span>
        </div>
      </div>
      {sub && <span className="rs-occam-ring__sub">{sub}</span>}
      {detail && <span className="rs-occam-ring__detail">{detail}</span>}
    </div>
  );
}

export default function HealthPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [weightLogs, setWeightLogs] = useState([]);
  const [weightDate, setWeightDate] = useState(todayStr());
  const [weightLb, setWeightLb] = useState("");

  const [sessions, setSessions] = useState([]);
  const [setsWithSession, setSetsWithSession] = useState([]);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [setsBySession, setSetsBySession] = useState({});

  const [newSessionDate, setNewSessionDate] = useState(todayStr());
  const [newSetExercise, setNewSetExercise] = useState("");
  const [newSetWeight, setNewSetWeight] = useState("");
  const [newSetReps, setNewSetReps] = useState("");
  const [newSetNumber, setNewSetNumber] = useState("");

  const [measurements, setMeasurements] = useState(MEASURE_DEFAULTS);
  const [measureDate, setMeasureDate] = useState(todayStr());
  const [savingMeasures, setSavingMeasures] = useState(false);

  const [celebrate, setCelebrate] = useState(null);
  const bestBenchRef = useRef(null);
  const bestSquatRef = useRef(null);
  const celebratedCompleteRef = useRef({});

  const dateToday = todayStr();
  const [userPreferences, setUserPreferences] = useState(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [workoutTab, setWorkoutTab] = useState("Occam A");

  const scheduleState = useMemo(
    () =>
      getOccamScheduleState({
        preferences: userPreferences,
        setsWithSession,
        now: new Date(),
      }),
    [userPreferences, setsWithSession]
  );

  const todaysPlan = useMemo(
    () => buildWorkoutPlanForPhase(scheduleState.phase, dateToday, scheduleState),
    [scheduleState, dateToday]
  );

  const setsByDate = useMemo(() => groupSetsBySessionDate(setsWithSession), [setsWithSession]);

  const nextEligibleDateStr = useMemo(() => {
    if (!scheduleState.recoveryEndsAt) return null;
    const d = scheduleState.recoveryEndsAt;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, [scheduleState.recoveryEndsAt]);

  const recoveryBarPct = useMemo(() => {
    if (
      !scheduleState.lastCompletion ||
      scheduleState.mode !== "recovery" ||
      !scheduleState.recoveryEndsAt
    )
      return scheduleState.mode === "workout" ? 100 : 0;
    const start = scheduleState.lastCompletion.completedAt.getTime();
    const end = scheduleState.recoveryEndsAt.getTime();
    const now = Date.now();
    const p = ((now - start) / (end - start)) * 100;
    return Math.min(100, Math.max(0, p));
  }, [scheduleState]);

  useEffect(() => {
    if (scheduleState.mode === "recovery" && scheduleState.nextWorkoutAfterRecovery) {
      setWorkoutTab(scheduleState.nextWorkoutAfterRecovery);
    } else if (scheduleState.phase === "Occam A" || scheduleState.phase === "Occam B") {
      setWorkoutTab(scheduleState.phase);
    }
  }, [scheduleState.mode, scheduleState.phase, scheduleState.nextWorkoutAfterRecovery]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [wRes, sRes, setsRes, profileRes] = await Promise.all([
        getBodyWeightLogs(user.id, 120),
        getLiftingSessions(user.id, 60),
        getLiftingSetsWithSession(user.id, 500),
        getUserProfile(user.id),
      ]);
      if (wRes.error) setError(wRes.error.message);
      else setWeightLogs(wRes.data || []);
      if (sRes.error) setError(sRes.error.message);
      else setSessions(sRes.data || []);
      if (!setsRes.error) {
        const rows = setsRes.data || [];
        setSetsWithSession(rows);
        const { bestBenchLb, bestSquatLb } = deriveBestsFromSets(rows);
        bestBenchRef.current = bestBenchLb;
        bestSquatRef.current = bestSquatLb;
      }
      if (!profileRes.error && profileRes.data?.profile) {
        const prof = profileRes.data.profile;
        const om = prof.preferences?.occam_measurements || {};
        setMeasurements({
          chest_in: om.chest_in != null ? String(om.chest_in) : "",
          waist_in: om.waist_in != null ? String(om.waist_in) : "",
          hips_in: om.hips_in != null ? String(om.hips_in) : "",
          shoulders_in: om.shoulders_in != null ? String(om.shoulders_in) : "",
          neck_in: om.neck_in != null ? String(om.neck_in) : "",
          left_bicep_in: om.left_bicep_in != null ? String(om.left_bicep_in) : "",
          left_quad_in: om.left_quad_in != null ? String(om.left_quad_in) : "",
          left_calf_in: om.left_calf_in != null ? String(om.left_calf_in) : "",
        });
        if (om.measured_at) setMeasureDate(String(om.measured_at).slice(0, 10));

        let prefs = prof.preferences || {};
        const rows = setsRes.error ? [] : setsRes.data || [];
        const inferred = inferLatestOccamCompletionFromSets(rows);
        const existingLc = prefs.occam_schedule?.last_completion;
        const existingAt = existingLc?.completed_at
          ? new Date(existingLc.completed_at).getTime()
          : 0;
        const infAt = inferred?.completedAt?.getTime() ?? 0;
        if (inferred && infAt > existingAt) {
          prefs = {
            ...prefs,
            occam_schedule: {
              ...prefs.occam_schedule,
              last_completion: {
                phase: inferred.phase,
                completed_at: inferred.completedAt.toISOString(),
                session_date: inferred.session_date,
              },
            },
          };
          const up = await upsertUserProfile(user.id, { ...prof, preferences: prefs });
          if (up.error) setError(up.error.message);
        }
        setUserPreferences(prefs);
      } else {
        setUserPreferences(null);
      }
    } catch (e) {
      setError(e?.message || "Failed to load health data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadSets(sessionId) {
    const res = await getLiftingSets(sessionId);
    if (!res.error) setSetsBySession((prev) => ({ ...prev, [sessionId]: res.data || [] }));
  }

  useEffect(() => {
    if (!expandedSessionId) return;
    loadSets(expandedSessionId);
  }, [expandedSessionId]);

  function flashCelebrate(payload) {
    setCelebrate(payload);
    window.setTimeout(() => setCelebrate((c) => (c === payload ? null : c)), 5200);
  }

  async function handleAddWeight() {
    if (!user || !weightLb.trim()) return;
    setError("");
    const res = await insertBodyWeightLog(user.id, weightDate, parseFloat(weightLb), "lb");
    if (res.error) setError(res.error.message);
    else {
      setWeightLogs((prev) => [res.data, ...prev]);
      setWeightLb("");
      setWeightDate(todayStr());
      flashCelebrate({
        kind: "weight",
        title: "Logged",
        body: "Body weight recorded — your strength goals update automatically.",
      });
    }
  }

  async function handleSaveMeasurements() {
    if (!user) return;
    setSavingMeasures(true);
    setError("");
    try {
      const res = await getUserProfile(user.id);
      const profile = res?.data?.profile || {};
      const prefs = {
        ...(profile.preferences || {}),
        occam_measurements: {
          chest_in: measurements.chest_in === "" ? null : parseFloat(measurements.chest_in),
          waist_in: measurements.waist_in === "" ? null : parseFloat(measurements.waist_in),
          hips_in: measurements.hips_in === "" ? null : parseFloat(measurements.hips_in),
          shoulders_in: measurements.shoulders_in === "" ? null : parseFloat(measurements.shoulders_in),
          neck_in: measurements.neck_in === "" ? null : parseFloat(measurements.neck_in),
          left_bicep_in:
            measurements.left_bicep_in === "" ? null : parseFloat(measurements.left_bicep_in),
          left_quad_in:
            measurements.left_quad_in === "" ? null : parseFloat(measurements.left_quad_in),
          left_calf_in:
            measurements.left_calf_in === "" ? null : parseFloat(measurements.left_calf_in),
          measured_at: measureDate,
        },
      };
      const up = await upsertUserProfile(user.id, { ...profile, preferences: prefs });
      if (up.error) setError(up.error.message);
      else {
        setUserPreferences(prefs);
        flashCelebrate({
          kind: "measures",
          title: "Measurements saved",
          body: "Tape progress is in — consistency beats perfection.",
        });
      }
    } finally {
      setSavingMeasures(false);
    }
  }

  async function handleCreateSession() {
    if (!user) return;
    setError("");
    const res = await createLiftingSession(user.id, newSessionDate);
    if (res.error) setError(res.error.message);
    else {
      setSessions((prev) => [res.data, ...prev]);
      setNewSessionDate(todayStr());
      setExpandedSessionId(res.data.id);
      flashCelebrate({
        kind: "session",
        title: "Session created",
        body: "Log each lift below — one hard set to failure per exercise (after warm-ups).",
      });
    }
  }

  async function ensureTodaysSession() {
    const existing = sessions.find((s) => s.session_date === dateToday);
    if (existing) {
      setExpandedSessionId(existing.id);
      return;
    }
    setNewSessionDate(dateToday);
    const res = await createLiftingSession(user.id, dateToday);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setSessions((prev) => [res.data, ...prev]);
    setExpandedSessionId(res.data.id);
    flashCelebrate({
      kind: "session",
      title: "Today’s session is ready",
      body: "Add your working sets when you’re done with warm-ups.",
    });
  }

  async function handleAddSet(sessionId) {
    if (!newSetExercise.trim() || !user) return;
    setError("");
    const w = newSetWeight ? parseFloat(newSetWeight) : null;
    const ex = newSetExercise.trim();
    const { countsForBench, countsForSquatLike } = classifyLiftForGoals(ex);

    const res = await addLiftingSet(user.id, sessionId, {
      exercise_name: ex,
      weight: w,
      reps: newSetReps ? parseInt(newSetReps, 10) : null,
      set_number: newSetNumber ? parseInt(newSetNumber, 10) : null,
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }

    if (w != null && !Number.isNaN(w)) {
      if (countsForBench && w > (bestBenchRef.current ?? 0)) {
        bestBenchRef.current = w;
        flashCelebrate({
          kind: "pr_bench",
          title: "Bench milestone",
          body: `New top weight logged: ${w} lb. You’re pressing toward 1× bodyweight.`,
        });
      }
      if (countsForSquatLike && w > (bestSquatRef.current ?? 0)) {
        bestSquatRef.current = w;
        flashCelebrate({
          kind: "pr_squat",
          title: "Leg strength milestone",
          body: `New top load: ${w} lb. Tracking toward 2× bodyweight on squat.`,
        });
      }
    }

    loadSets(sessionId);
    const full = await getLiftingSetsWithSession(user.id, 500);
    if (!full.error) setSetsWithSession(full.data || []);

    setNewSetExercise("");
    setNewSetWeight("");
    setNewSetReps("");
    setNewSetNumber("");

    const sess = sessions.find((s) => s.id === sessionId);
    if (sess && sess.session_date === dateToday) {
      const onDate = setsForSessionDate(full.data || [], dateToday);
      const withNew = [...onDate, { exercise: ex, weight: w }];
      for (const phase of ["Occam A", "Occam B"]) {
        if (
          occamSessionLooksComplete(withNew, phase) &&
          !celebratedCompleteRef.current[dateToday + phase]
        ) {
          celebratedCompleteRef.current[dateToday + phase] = true;
          flashCelebrate({
            kind: "full",
            title: "Protocol success!",
            body: "You’ve logged every lift for this Occam template. Check it off on Today when you’re ready to celebrate the win.",
          });
          const inf = inferLatestOccamCompletionFromSets(full.data || []);
          if (inf && user) {
            const pr = await getUserProfile(user.id);
            const prof = pr?.data?.profile;
            if (prof) {
              const prefs = {
                ...prof.preferences,
                occam_schedule: {
                  ...prof.preferences?.occam_schedule,
                  last_completion: {
                    phase: inf.phase,
                    completed_at: inf.completedAt.toISOString(),
                    session_date: inf.session_date,
                  },
                },
              };
              const up = await upsertUserProfile(user.id, { ...prof, preferences: prefs });
              if (!up.error) setUserPreferences(prefs);
            }
          }
          break;
        }
      }
    }
  }

  const weightChartData = [...(weightLogs || [])]
    .reverse()
    .map((r) => ({
      date: localDateStr(r.measured_at),
      weight: r.unit === "kg" ? Math.round(r.weight * 2.205) : r.weight,
    }));

  const latestBodyWeightLb = useMemo(() => {
    const sorted = [...(weightLogs || [])].sort(
      (a, b) => new Date(b.measured_at) - new Date(a.measured_at)
    );
    const r = sorted[0];
    if (!r) return null;
    return r.unit === "kg" ? r.weight * 2.205 : r.weight;
  }, [weightLogs]);

  const { bestBenchLb, bestSquatLb } = useMemo(
    () => deriveBestsFromSets(setsWithSession),
    [setsWithSession]
  );

  const pctBenchGoal =
    latestBodyWeightLb && latestBodyWeightLb > 0 && bestBenchLb != null
      ? Math.min(100, Math.round((bestBenchLb / latestBodyWeightLb) * 100))
      : null;
  const pctSquatGoal =
    latestBodyWeightLb && latestBodyWeightLb > 0 && bestSquatLb != null
      ? Math.min(100, Math.round((bestSquatLb / (2 * latestBodyWeightLb)) * 100))
      : null;

  const exerciseChartData = useMemo(() => {
    const rows = setsWithSession || [];
    const byDate = new Map();
    for (const row of rows) {
      const sessionDate = row.session?.session_date;
      if (!sessionDate) continue;
      const exercise = (row.exercise || "").trim() || "Unknown";
      const w = row.weight != null ? Number(row.weight) : null;
      if (w == null) continue;
      let entry = byDate.get(sessionDate);
      if (!entry) {
        entry = { date: sessionDate };
        byDate.set(sessionDate, entry);
      }
      const prev = entry[exercise];
      entry[exercise] = prev == null ? w : Math.max(prev, w);
    }
    const dates = [...byDate.keys()].sort();
    const data = dates.map((d) => byDate.get(d));
    const exerciseNames = [...new Set(data.flatMap((d) => Object.keys(d).filter((k) => k !== "date")))]
      .filter(Boolean)
      .sort();
    return { data, exerciseNames };
  }, [setsWithSession]);

  const occamExerciseOptions = useMemo(() => {
    const set = new Set();
    for (const w of Object.values(OCCAM_WORKOUTS)) {
      for (const ex of w.exercises || []) {
        set.add(ex.logName);
      }
    }
    return [...set];
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "var(--rs-on-surface-variant)" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ position: "relative", paddingBottom: 24 }}>
        {celebrate && (
          <div className="rs-health-celebrate" role="status">
            <div className="rs-health-celebrate__inner">
              <span className="material-symbols-outlined rs-health-celebrate__icon" aria-hidden>
                {celebrate.kind === "pr_bench" || celebrate.kind === "pr_squat"
                  ? "star"
                  : celebrate.kind === "full" || celebrate.kind === "protocol"
                    ? "emoji_events"
                    : "favorite"}
              </span>
              <div>
                <div className="rs-health-celebrate__title">{celebrate.title}</div>
                <div className="rs-health-celebrate__body">{celebrate.body}</div>
              </div>
            </div>
          </div>
        )}

        <PageHeader
          eyebrow="Minimal dose, maximum signal"
          title="Occam Workout"
          subtitle={
            <>
              Tim Ferriss’s Occam’s Protocol — about{" "}
              <strong style={{ color: "var(--rs-on-surface)" }}>two brief heavy sessions</strong> per week,
              5/5 tempo, one top set. Pair with protein and sleep. Bench goal:{" "}
              <strong>1× bodyweight</strong>. Squat anchor: <strong>2× bodyweight</strong> equivalent.
            </>
          }
        />

        {error && (
          <p style={{ color: "var(--rs-error)", fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <OccamNotifySettings />

        <div className="rs-health-dashboard">
          <div className="rs-health-dashboard__grid">
            <div className="rs-health-dashboard__main">
              <OccamMonthCalendar
                year={calYear}
                monthIndex={calMonth}
                onPrevMonth={() => {
                  setCalMonth((prev) => {
                    if (prev === 0) {
                      setCalYear((y) => y - 1);
                      return 11;
                    }
                    return prev - 1;
                  });
                }}
                onNextMonth={() => {
                  setCalMonth((prev) => {
                    if (prev === 11) {
                      setCalYear((y) => y + 1);
                      return 0;
                    }
                    return prev + 1;
                  });
                }}
                todayStr={dateToday}
                setsByDate={setsByDate}
                nextEligibleDateStr={nextEligibleDateStr}
              />

              <section className="rs-section-card rs-health-hero rs-occam-engine">
                <div className="rs-occam-engine__head">
                  <div>
                    <p className="rs-page-eyebrow" style={{ marginBottom: 6 }}>
                      Occam&apos;s protocol engine
                    </p>
                    <h2 className="rs-section-card__title" style={{ fontSize: "1.2rem", marginBottom: 4 }}>
                      Hypertrophy through precision &amp; forced recovery
                    </h2>
                    <p className="rs-section-card__subtitle" style={{ marginBottom: 0 }}>
                      Today · {dateToday}
                    </p>
                  </div>
                  <span className="rs-occam-cadence-pill">5/5 cadence mandate</span>
                </div>

                <div className="rs-occam-tabs" role="tablist" aria-label="Occam workout templates">
                  {["Occam A", "Occam B"].map((key) => {
                    const active = workoutTab === key;
                    const short = key === "Occam A" ? "A" : "B";
                    const sub = key === "Occam A" ? "Row & press" : "Bench & squat";
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rs-occam-tab${active ? " rs-occam-tab--active" : ""}`}
                        onClick={() => setWorkoutTab(key)}
                      >
                        <span className="rs-occam-tab__title">Workout {short}</span>
                        <span className="rs-occam-tab__sub">{sub}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="rs-occam-session-status">
                  {scheduleState.mode === "recovery" ? (
                    <>
                      <strong>Recovery window</strong> — next heavy session:{" "}
                      <strong>{scheduleState.nextWorkoutAfterRecovery}</strong>
                      {scheduleState.recoveryEndsAt && (
                        <>
                          {" "}
                          · eligible from{" "}
                          <strong>
                            {scheduleState.recoveryEndsAt.toLocaleString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <strong>Current focus:</strong> {scheduleState.dueWorkout} — complete when ready; missed days
                      keep the same assignment until you log it.
                    </>
                  )}
                </p>

                <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: "0 0 16px" }}>
                  <strong>{OCCAM_CADENCE_SHORT}</strong>. {OCCAM_PROTOCOL_BLURB}
                </p>

                {(OCCAM_WORKOUTS[workoutTab]?.exercises || []).map((ex) => {
                  const last = getLastTopSetForOccamExercise(setsWithSession, ex);
                  const sugg = last?.weight != null && last?.reps != null
                    ? suggestOccamWeight(last.weight, last.reps, ex.targetReps)
                    : null;
                  const tipClass =
                    ex.tipVariant === "cadence"
                      ? "rs-occam-ex-tip--cadence"
                      : ex.tipVariant === "volume"
                        ? "rs-occam-ex-tip--volume"
                        : "rs-occam-ex-tip--range";
                  const showDue =
                    workoutTab === scheduleState.dueWorkout && scheduleState.mode === "workout";
                  return (
                    <article
                      key={ex.key}
                      className={`rs-occam-ex-card${showDue ? " rs-occam-ex-card--due" : ""}`}
                    >
                      <div className="rs-occam-ex-card__top">
                        <div>
                          <h3 className="rs-occam-ex-card__name">{ex.name}</h3>
                          {ex.focus && (
                            <p className="rs-occam-ex-card__focus">{ex.focus}</p>
                          )}
                        </div>
                        {showDue && <span className="rs-occam-ex-card__badge">Due now</span>}
                      </div>
                      <p className="rs-occam-ex-card__last">
                        {last
                          ? `Last session: ${last.weight} lb × ${last.reps ?? "—"} · ${last.session_date}`
                          : "No prior log for this lift — start conservative after warm-ups."}
                      </p>
                      {sugg?.text && (
                        <p className="rs-occam-ex-card__suggest">
                          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
                            trending_up
                          </span>
                          {sugg.text}
                        </p>
                      )}
                      {ex.protocolTip && (
                        <div className={`rs-occam-ex-tip ${tipClass}`}>{ex.protocolTip}</div>
                      )}
                      <p className="rs-occam-ex-card__meta">
                        Target <strong>{ex.targetReps}</strong> · {ex.detail}
                      </p>
                    </article>
                  );
                })}

                {scheduleState.mode === "recovery" && (
                  <p className="rs-section-card__subtitle" style={{ marginTop: 14, marginBottom: 0 }}>
                    Between heavy sessions: walk, easy mobility, sleep, protein — protect the{" "}
                    {MIN_RECOVERY_HOURS}–{IDEAL_RECOVERY_HOURS}h recovery runway before the next load.
                  </p>
                )}

                <div className="rs-occam-engine__actions">
                  <button type="button" className="rs-btn-primary" onClick={ensureTodaysSession}>
                    Log today&apos;s lifts
                  </button>
                  <Link
                    href="/today"
                    className="rs-btn-ghost"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Check off on Today →
                  </Link>
                </div>
              </section>
            </div>

            <aside className="rs-health-dashboard__aside">
              <div className="rs-section-card rs-occam-aside-card">
                <p className="rs-page-eyebrow" style={{ marginBottom: 8 }}>
                  Recovery intelligence
                </p>
                <h3 className="rs-occam-aside-card__title">Next scheduled session</h3>
                {scheduleState.mode === "recovery" && scheduleState.recoveryEndsAt ? (
                  <p className="rs-occam-aside-card__body">
                    <strong>{scheduleState.nextWorkoutAfterRecovery}</strong> unlocks after{" "}
                    {MIN_RECOVERY_HOURS}h minimum recovery
                    <span style={{ display: "block", marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                      Eligible:{" "}
                      {scheduleState.recoveryEndsAt.toLocaleString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="rs-occam-aside-card__body">
                    <strong>{scheduleState.dueWorkout}</strong> is ready when you are. Spacing to the next
                    session starts after you log a complete Occam workout.
                  </p>
                )}
              </div>

              <div className="rs-section-card rs-occam-aside-card">
                <p className="rs-page-eyebrow" style={{ marginBottom: 10 }}>
                  Path to peak performance
                </p>
                <div className="rs-occam-rings-row">
                  <OccamGoalRing
                    pct={pctBenchGoal}
                    title="1× BW bench"
                    sub={
                      latestBodyWeightLb != null && bestBenchLb != null
                        ? `${Math.round(bestBenchLb)} / ${Math.round(latestBodyWeightLb)} lb`
                        : "Log bench + weight"
                    }
                    detail={pctBenchGoal != null ? `${pctBenchGoal}% of goal` : null}
                  />
                  <OccamGoalRing
                    pct={pctSquatGoal}
                    title="2× BW squat"
                    sub={
                      latestBodyWeightLb != null && bestSquatLb != null
                        ? `${Math.round(bestSquatLb)} / ${Math.round(2 * latestBodyWeightLb)} lb`
                        : "Log squat"
                    }
                    detail={pctSquatGoal != null ? `${pctSquatGoal}% of goal` : null}
                  />
                </div>
                <p className="rs-occam-bw-inline">
                  Body weight:{" "}
                  <strong>
                    {latestBodyWeightLb != null ? `${Number(latestBodyWeightLb).toFixed(1)} lb` : "—"}
                  </strong>
                </p>
              </div>

              {(pctBenchGoal >= 100 || pctSquatGoal >= 100) && (
                <div className="rs-insight-panel rs-occam-aside-card">
                  <p className="rs-insight-panel__title">Goal achieved</p>
                  <p className="rs-insight-panel__body" style={{ margin: 0 }}>
                    {pctBenchGoal >= 100 && "You’ve hit the 1× bodyweight bench benchmark. "}
                    {pctSquatGoal >= 100 && "You’ve hit the 2× bodyweight leg strength benchmark. "}
                    Maintain with Occam-style minimum effective dose, or set new targets in your training journal.
                  </p>
                </div>
              )}

              <div className="rs-section-card rs-occam-aside-card">
                <div className="rs-occam-morph-head">
                  <h3 className="rs-occam-aside-card__title" style={{ marginBottom: 0 }}>
                    Morphology tracker
                  </h3>
                  <span className="rs-page-eyebrow" style={{ margin: 0 }}>
                    CNS &amp; recomposition
                  </span>
                </div>
                <div className="rs-occam-morph-grid">
                  {[
                    ["chest_in", "Chest"],
                    ["waist_in", "Waist"],
                    ["hips_in", "Hips"],
                    ["shoulders_in", "Shoulders"],
                    ["neck_in", "Neck"],
                    ["left_bicep_in", "Left bicep"],
                    ["left_quad_in", "Left quad"],
                    ["left_calf_in", "Left calf"],
                  ].map(([key, label]) => (
                    <label key={key} className="rs-occam-morph-field">
                      <span>{label}</span>
                      <input
                        type="number"
                        step="0.1"
                        className="rs-input"
                        value={measurements[key]}
                        onChange={(e) => setMeasurements((m) => ({ ...m, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                <div className="rs-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
                  <input
                    type="date"
                    value={measureDate}
                    onChange={(e) => setMeasureDate(e.target.value)}
                    className="rs-input"
                    style={{ width: "auto" }}
                  />
                  <button
                    type="button"
                    className="rs-btn-primary"
                    onClick={handleSaveMeasurements}
                    disabled={savingMeasures}
                  >
                    {savingMeasures ? "Saving…" : "Update measurements"}
                  </button>
                </div>
              </div>

              <div className="rs-section-card rs-occam-aside-card rs-occam-golden">
                <span className="material-symbols-outlined rs-occam-golden__icon" aria-hidden>
                  spa
                </span>
                <div>
                  <p className="rs-occam-aside-card__title" style={{ marginBottom: 4 }}>
                    Aesthetic symmetry
                  </p>
                  <p className="rs-occam-golden__ratio">1.618</p>
                  <p className="rs-occam-aside-card__body" style={{ margin: 0, fontSize: 12 }}>
                    A calm nod to proportion — your ratios are defined by consistent training and sleep, not a
                    single number.
                  </p>
                </div>
              </div>

              <div className="rs-section-card rs-occam-aside-card rs-occam-recovery-vector">
                <div className="rs-occam-recovery-vector__head">
                  <span className="material-symbols-outlined" aria-hidden>
                    bedtime
                  </span>
                  <h3 className="rs-occam-aside-card__title" style={{ marginBottom: 0 }}>
                    Recovery vector
                  </h3>
                </div>
                <div className="rs-occam-recovery-bar">
                  <div
                    className="rs-occam-recovery-bar__fill"
                    style={{ width: `${recoveryBarPct}%` }}
                  />
                </div>
                <p className="rs-occam-aside-card__body" style={{ margin: "10px 0 0", fontSize: 12 }}>
                  {scheduleState.mode === "recovery"
                    ? "Protein synthesis still climbing — protect sleep and easy movement until your next heavy window opens."
                    : "System clear for focused loading — warm up thoroughly, then one honest set per lift."}
                </p>
              </div>
            </aside>
          </div>
        </div>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title">Body weight</h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
            Weigh-in drives your bench/squat goal bars (1× and 2× multipliers).
          </p>
          <div className="rs-toolbar" style={{ marginBottom: 12 }}>
            <input
              type="date"
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
              className="rs-input"
              style={{ width: "auto" }}
            />
            <input
              type="number"
              step="0.1"
              placeholder="lb"
              value={weightLb}
              onChange={(e) => setWeightLb(e.target.value)}
              className="rs-input"
              style={{ width: 100 }}
            />
            <button type="button" className="rs-btn-primary" onClick={handleAddWeight} disabled={!weightLb.trim()}>
              Log weight
            </button>
          </div>
          {weightChartData.length > 0 && (
            <div style={{ height: 220, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(186, 177, 159, 0.25)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#6b5500"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#d4af37" }}
                    name="Weight (lb)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {exerciseChartData.data.length > 0 && exerciseChartData.exerciseNames.length > 0 && (
          <section className="rs-section-card">
            <h2 className="rs-section-card__title">Strength trend</h2>
            <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
              Max weight logged per session by exercise (lb).
            </p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={exerciseChartData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(186, 177, 159, 0.25)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#655e4f" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <Tooltip />
                  <Legend />
                  {exerciseChartData.exerciseNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="rs-section-card">
          <h2 className="rs-section-card__title">Training sessions</h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
            One row per gym visit. Expand to log working sets (Occam = typically one top set per lift after warm-up).
          </p>
          <div className="rs-toolbar" style={{ marginBottom: 14 }}>
            <input
              type="date"
              value={newSessionDate}
              onChange={(e) => setNewSessionDate(e.target.value)}
              className="rs-input"
              style={{ width: "auto" }}
            />
            <button type="button" className="rs-btn-ghost" onClick={handleCreateSession}>
              New session
            </button>
          </div>
          {sessions.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--rs-on-surface-variant)", margin: 0 }}>
              No sessions yet — start with &quot;Log today&apos;s lifts&quot; above.
            </p>
          ) : (
            <ul className="rs-health-session-list">
              {sessions.map((s) => (
                <li key={s.id} className="rs-health-session">
                  <button
                    type="button"
                    className="rs-health-session__toggle"
                    onClick={() => setExpandedSessionId((id) => (id === s.id ? null : s.id))}
                  >
                    <span>{s.session_date}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {expandedSessionId === s.id ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {expandedSessionId === s.id && (
                    <div className="rs-health-session__body">
                      <p style={{ fontSize: 12, color: "var(--rs-on-surface-variant)", margin: "0 0 10px" }}>
                        Pick an exercise (or type a custom name). Bench / incline / decline count toward the bench goal;
                        squats count toward the 2× goal.
                      </p>
                      <div className="rs-health-set-form">
                        <select
                          value={occamExerciseOptions.includes(newSetExercise) ? newSetExercise : ""}
                          onChange={(e) => setNewSetExercise(e.target.value || "")}
                          className="rs-select-compact"
                        >
                          <option value="">Quick pick…</option>
                          {occamExerciseOptions.map((ex) => (
                            <option key={ex} value={ex}>
                              {ex}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Or type exercise name"
                          value={newSetExercise}
                          onChange={(e) => setNewSetExercise(e.target.value)}
                          className="rs-input"
                        />
                        <input
                          type="number"
                          step="0.5"
                          placeholder="lb"
                          value={newSetWeight}
                          onChange={(e) => setNewSetWeight(e.target.value)}
                          className="rs-input"
                          style={{ maxWidth: 90 }}
                        />
                        <input
                          type="number"
                          placeholder="reps"
                          value={newSetReps}
                          onChange={(e) => setNewSetReps(e.target.value)}
                          className="rs-input"
                          style={{ maxWidth: 90 }}
                        />
                        <input
                          type="number"
                          placeholder="set #"
                          value={newSetNumber}
                          onChange={(e) => setNewSetNumber(e.target.value)}
                          className="rs-input"
                          style={{ maxWidth: 72 }}
                        />
                        <button
                          type="button"
                          className="rs-btn-primary"
                          onClick={() => handleAddSet(s.id)}
                          disabled={!newSetExercise.trim()}
                        >
                          Add set
                        </button>
                      </div>
                      <table className="rs-health-table">
                        <thead>
                          <tr>
                            <th>Exercise</th>
                            <th className="rs-health-table__num">lb</th>
                            <th className="rs-health-table__num">Reps</th>
                            <th className="rs-health-table__num">Set</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(setsBySession[s.id] || []).map((set) => (
                            <tr key={set.id}>
                              <td>{set.exercise}</td>
                              <td className="rs-health-table__num">{set.weight != null ? set.weight : "—"}</td>
                              <td className="rs-health-table__num">{set.reps ?? "—"}</td>
                              <td className="rs-health-table__num">{set.set_number ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rs-section-card" style={{ marginBottom: 0 }}>
          <h2 className="rs-section-card__title">About Occam &amp; trackers</h2>
          <p className="rs-section-card__subtitle" style={{ margin: 0, lineHeight: 1.55 }}>
            Popular apps (Strong, Hevy, Jefit) excel at logging sets; Occam is unusual because it prescribes{" "}
            <strong>frequency, tempo, and one top set</strong>. This page mirrors that structure and ties it to your
            Today checklist. Always prioritize form; consider a coach for loaded movements.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
