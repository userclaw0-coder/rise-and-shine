import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
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
import { getWorkoutPlanForDate } from "../lib/scoring";
import {
  OCCAM_CADENCE_SHORT,
  OCCAM_PROTOCOL_BLURB,
  OCCAM_WORKOUTS,
  classifyLiftForGoals,
} from "../lib/occam";
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

function occamSessionLooksComplete(setsOnDate, phase) {
  const plan = OCCAM_WORKOUTS[phase];
  if (!plan || !plan.exercises?.length) return false;
  const logged = (setsOnDate || []).map((s) => (s.exercise || "").toLowerCase());
  return plan.exercises.every((ex) =>
    logged.some((n) => n.includes(ex.logName.toLowerCase()) || n.includes(ex.name.toLowerCase().slice(0, 8)))
  );
}

const MEASURE_DEFAULTS = {
  chest_in: "",
  waist_in: "",
  hips_in: "",
  shoulders_in: "",
  neck_in: "",
};

const CHART_COLORS = [
  "#6b5500",
  "#555d1e",
  "#d4af37",
  "#7f5c53",
  "#4a3d00",
  "#6b7530",
];

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
  const todaysPlan = useMemo(() => getWorkoutPlanForDate(dateToday), [dateToday]);

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
        const om = profileRes.data.profile.preferences?.occam_measurements || {};
        setMeasurements({
          chest_in: om.chest_in != null ? String(om.chest_in) : "",
          waist_in: om.waist_in != null ? String(om.waist_in) : "",
          hips_in: om.hips_in != null ? String(om.hips_in) : "",
          shoulders_in: om.shoulders_in != null ? String(om.shoulders_in) : "",
          neck_in: om.neck_in != null ? String(om.neck_in) : "",
        });
        if (om.measured_at) setMeasureDate(String(om.measured_at).slice(0, 10));
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
          measured_at: measureDate,
        },
      };
      const up = await upsertUserProfile(user.id, { ...profile, preferences: prefs });
      if (up.error) setError(up.error.message);
      else {
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
          body: `New top load: ${w} lb. Tracking toward 2× bodyweight (squat or leg press).`,
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
    if (
      sess &&
      sess.session_date === dateToday &&
      OCCAM_WORKOUTS[todaysPlan.phase]
    ) {
      const onDate = setsForSessionDate(full.data || [], dateToday);
      const withNew = [...onDate, { exercise: ex, weight: w }];
      if (
        occamSessionLooksComplete(withNew, todaysPlan.phase) &&
        !celebratedCompleteRef.current[dateToday + todaysPlan.phase]
      ) {
        celebratedCompleteRef.current[dateToday + todaysPlan.phase] = true;
        flashCelebrate({
          kind: "full",
          title: "Occam session complete",
          body: "You hit every lift for today’s template. Check it off on Today when you’re ready to celebrate the win.",
        });
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
                  : celebrate.kind === "full"
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
              <strong>1× bodyweight</strong>. Squat / leg press anchor: <strong>2× bodyweight</strong> equivalent.
            </>
          }
        />

        {error && (
          <p style={{ color: "var(--rs-error)", fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <section className="rs-section-card rs-health-hero">
          <p className="rs-page-eyebrow" style={{ marginBottom: 8 }}>
            Today · {dateToday}
          </p>
          <h2 className="rs-section-card__title" style={{ fontSize: "1.25rem", marginBottom: 6 }}>
            {todaysPlan?.title || "Workout"}
          </h2>
          {todaysPlan?.occamLabel && (
            <p className="rs-section-card__subtitle" style={{ marginBottom: 10 }}>
              {todaysPlan.occamLabel}
            </p>
          )}
          <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: "0 0 14px" }}>
            <strong>{OCCAM_CADENCE_SHORT}</strong>. {OCCAM_PROTOCOL_BLURB}
          </p>
          {todaysPlan?.exercises?.length > 0 ? (
            <ul className="rs-health-today-list">
              {todaysPlan.exercises.map((ex) => (
                <li key={ex.key}>
                  <span className="rs-health-today-list__name">{ex.name}</span>
                  <span className="rs-health-today-list__meta">
                    {ex.targetReps} reps · {ex.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rs-section-card__subtitle" style={{ marginBottom: 14 }}>
              Light day — mobility, walking, easy movement. Keep blood flowing between Occam sessions.
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" className="rs-btn-primary" onClick={ensureTodaysSession}>
              Log today&apos;s lifts
            </button>
            <Link href="/today" className="rs-btn-ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Check off on Today →
            </Link>
          </div>
        </section>

        <div className="rs-stat-grid" style={{ marginBottom: 20 }}>
          <div className="rs-stat-tile">
            <div className="rs-stat-tile__label">Body weight</div>
            <div className="rs-stat-tile__value" style={{ fontSize: "1.35rem" }}>
              {latestBodyWeightLb != null ? `${Number(latestBodyWeightLb).toFixed(1)} lb` : "—"}
            </div>
            <div className="rs-stat-tile__hint">For goal percentages</div>
          </div>
          <div className="rs-stat-tile rs-stat-tile--gold">
            <div className="rs-stat-tile__label">Bench → 1× BW</div>
            <div className="rs-stat-tile__value" style={{ fontSize: "1.35rem" }}>
              {bestBenchLb != null ? `${bestBenchLb} lb` : "—"}
            </div>
            <div className="rs-stat-tile__hint">
              {pctBenchGoal != null ? `${pctBenchGoal}% of goal` : "Log a bench variation"}
            </div>
          </div>
          <div className="rs-stat-tile">
            <div className="rs-stat-tile__label">Squat / leg press → 2× BW</div>
            <div className="rs-stat-tile__value" style={{ fontSize: "1.35rem" }}>
              {bestSquatLb != null ? `${bestSquatLb} lb` : "—"}
            </div>
            <div className="rs-stat-tile__hint">
              {pctSquatGoal != null ? `${pctSquatGoal}% of goal` : "Log squat or leg press"}
            </div>
          </div>
        </div>

        {(pctBenchGoal >= 100 || pctSquatGoal >= 100) && (
          <div className="rs-insight-panel" style={{ marginBottom: 20 }}>
            <p className="rs-insight-panel__title">Goal achieved</p>
            <p className="rs-insight-panel__body" style={{ margin: 0 }}>
              {pctBenchGoal >= 100 && "You’ve hit the 1× bodyweight bench benchmark. "}
              {pctSquatGoal >= 100 && "You’ve hit the 2× bodyweight leg strength benchmark. "}
              Maintain with Occam-style minimum effective dose, or set new targets in your training journal.
            </p>
          </div>
        )}

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

        <section className="rs-section-card">
          <h2 className="rs-section-card__title">Body measurements</h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 14 }}>
            Tape measurements (inches). Stored in your profile — great for long-term recomposition, not daily noise.
          </p>
          <div className="rs-backlog-card__detail-grid" style={{ marginBottom: 12 }}>
            {[
              ["chest_in", "Chest"],
              ["waist_in", "Waist"],
              ["hips_in", "Hips"],
              ["shoulders_in", "Shoulders"],
              ["neck_in", "Neck"],
            ].map(([key, label]) => (
              <label key={key} className="rs-backlog-card__field">
                <span className="rs-backlog-card__field-label">{label} (in)</span>
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
          <div className="rs-toolbar">
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
              {savingMeasures ? "Saving…" : "Save measurements"}
            </button>
          </div>
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
                        squat and leg press count toward the 2× goal.
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
