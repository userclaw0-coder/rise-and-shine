import { useCallback, useEffect, useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import OccamMonthCalendar from "../components/OccamMonthCalendar";
import { useAuth } from "../hooks/useAuth";
import { getOccamScheduleState } from "../lib/occamSchedule";
import { getUserProfile } from "../lib/db";
import {
  getBodyWeightLogs,
  insertBodyWeightLog,
  getLiftingSessions,
  getLiftingSetsWithSession,
  createLiftingSession,
  addLiftingSet,
} from "../lib/db";

const OCCAM_LIFTS = [
  {
    id: "yates-row",
    label: "Yates row (EZ bar)",
    workout: "A",
    aliases: ["yates row", "yates", "ez row", "ez bar row"],
    color: "var(--ps-sage)",
  },
  {
    id: "barbell-press",
    label: "Barbell press",
    workout: "A",
    aliases: ["barbell press", "overhead press", "ohp", "press"],
    color: "var(--ps-plum)",
  },
  {
    id: "incline-bench",
    label: "Incline bench",
    workout: "B",
    aliases: ["incline bench", "bench", "incline"],
    color: "var(--ps-clay)",
  },
  {
    id: "squat",
    label: "Squat",
    workout: "B",
    aliases: ["squat", "back squat"],
    color: "var(--ps-accent)",
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function matchLift(exercise) {
  const lower = (exercise || "").toLowerCase();
  for (const l of OCCAM_LIFTS) {
    if (l.aliases.some((a) => lower.includes(a))) return l;
  }
  return null;
}

function sortBySessionDate(a, b) {
  const ad = a.session?.session_date || a.created_at;
  const bd = b.session?.session_date || b.created_at;
  return new Date(ad) - new Date(bd);
}

function Sparkline({ points, color }) {
  if (!points || points.length < 2) return null;
  const w = 160, h = 40, pad = 4;
  const ys = points.map((p) => p.w);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = (w - pad * 2) / Math.max(1, points.length - 1);
  const scaleY = (h - pad * 2) / Math.max(1, maxY - minY || 1);
  const d = points
    .map((p, i) => {
      const x = pad + i * scaleX;
      const y = h - pad - (p.w - minY) * scaleY;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="fit-spark">
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function HealthPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [allSets, setAllSets] = useState([]);
  const [weights, setWeights] = useState([]);
  const [addWeight, setAddWeight] = useState("");
  const [addingWeight, setAddingWeight] = useState(false);
  const [quickLift, setQuickLift] = useState("yates-row");
  const [quickWeight, setQuickWeight] = useState("");
  const [quickReps, setQuickReps] = useState("");
  const [logging, setLogging] = useState(false);
  const [profile, setProfile] = useState(null);
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [sessRes, setsRes, wtRes, profileRes] = await Promise.all([
        getLiftingSessions(user.id, 30),
        getLiftingSetsWithSession(user.id, 600),
        getBodyWeightLogs(user.id, 120),
        getUserProfile(user.id),
      ]);
      if (sessRes.error) throw new Error(sessRes.error.message);
      if (setsRes.error) throw new Error(setsRes.error.message);
      if (wtRes.error) throw new Error(wtRes.error.message);
      setSessions(sessRes.data || []);
      setAllSets(setsRes.data || []);
      setWeights(wtRes.data || []);
      setProfile(profileRes?.data?.profile || null);
    } catch (err) {
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const liftProgress = useMemo(() => {
    const byLift = new Map(OCCAM_LIFTS.map((l) => [l.id, []]));
    for (const s of [...allSets].sort(sortBySessionDate)) {
      const lift = matchLift(s.exercise);
      if (!lift) continue;
      const date = s.session?.session_date || s.created_at?.slice(0, 10);
      const last = byLift.get(lift.id).slice(-1)[0];
      if (last && last.d === date) {
        if ((s.weight || 0) > (last.w || 0)) {
          last.w = s.weight;
          last.reps = s.reps;
        }
      } else {
        byLift.get(lift.id).push({ d: date, w: Number(s.weight || 0), reps: s.reps });
      }
    }
    return OCCAM_LIFTS.map((l) => {
      const series = byLift.get(l.id) || [];
      const last = series[series.length - 1];
      return {
        ...l,
        series,
        currentWeight: last?.w ?? null,
        currentReps: last?.reps ?? null,
        sessionCount: series.length,
      };
    });
  }, [allSets]);

  const bodyweightSeries = useMemo(() => {
    return [...weights]
      .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
      .map((w) => ({ w: Number(w.weight), d: w.measured_at }));
  }, [weights]);

  const latestWeight = bodyweightSeries[bodyweightSeries.length - 1];

  const last7 = useMemo(() => {
    if (bodyweightSeries.length === 0) return null;
    const cutoff = Date.now() - 7 * 86400000;
    const recent = bodyweightSeries.filter((p) => new Date(p.d).getTime() >= cutoff);
    if (recent.length === 0) return null;
    const avg = recent.reduce((a, p) => a + p.w, 0) / recent.length;
    return avg;
  }, [bodyweightSeries]);

  const weekPlan = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayIdx = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayIdx);
    const slots = [
      { kind: "occam-a", label: "Occam A", sub: "Yates row + barbell press", color: "var(--ps-accent)" },
      { kind: "sprints", label: "Sprints", sub: "Hill · O'Mara", color: "var(--ps-clay)" },
      { kind: "recovery", label: "Recovery", sub: "Walk · mobility", color: "var(--ps-ink-30)" },
      { kind: "occam-b", label: "Occam B", sub: "Incline bench + squat", color: "var(--ps-accent)" },
      { kind: "row", label: "Rower", sub: "Sprint intervals", color: "var(--ps-indigo)" },
      { kind: "rest", label: "Rest", sub: "Adventure day", color: "var(--ps-ink-30)" },
      { kind: "rest", label: "Rest", sub: "Prep for week", color: "var(--ps-ink-30)" },
    ];
    return slots.map((s, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const done = sessions.some((sess) => sess.session_date === dateStr);
      return {
        ...s,
        day: DAYS[i],
        date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        done,
        today: i === dayIdx,
      };
    });
  }, [sessions]);

  const nextSession = useMemo(
    () => weekPlan.find((w) => w.today),
    [weekPlan]
  );

  const setsByDate = useMemo(() => {
    const map = new Map();
    for (const s of allSets) {
      const d = s.session?.session_date || s.created_at?.slice(0, 10);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(s);
    }
    return map;
  }, [allSets]);

  const occamSchedule = useMemo(() => {
    try {
      return getOccamScheduleState({
        preferences: profile?.preferences || null,
        setsWithSession: allSets,
      });
    } catch {
      return null;
    }
  }, [profile, allSets]);

  const nextEligibleDateStr = useMemo(() => {
    if (!occamSchedule?.recoveryEndsAt) return null;
    const d = new Date(occamSchedule.recoveryEndsAt);
    return d.toISOString().slice(0, 10);
  }, [occamSchedule]);

  function shiftMonth(delta) {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setCalMonth(m);
    setCalYear(y);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  async function handleWeightLog(e) {
    e.preventDefault();
    if (!user || !addWeight) return;
    setAddingWeight(true);
    setError("");
    const dateStr = new Date().toISOString().slice(0, 10);
    const res = await insertBodyWeightLog(user.id, dateStr, Number(addWeight), "lb");
    if (res?.error) {
      console.error("[health] insertBodyWeightLog failed:", res.error);
      setError(res.error.message || "Failed to save weight.");
      setAddingWeight(false);
      return;
    }
    setAddWeight("");
    setAddingWeight(false);
    load();
  }

  async function handleQuickLog(e) {
    e.preventDefault();
    if (!user || !quickWeight || !quickReps) return;
    setLogging(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      let session = sessions.find((s) => s.session_date === dateStr);
      if (!session) {
        const res = await createLiftingSession(user.id, dateStr);
        if (res.error) throw new Error(res.error.message);
        session = res.data;
      }
      const liftMeta = OCCAM_LIFTS.find((l) => l.id === quickLift);
      await addLiftingSet(user.id, session.id, {
        exercise: liftMeta.label,
        weight: Number(quickWeight),
        reps: Number(quickReps),
        set_number: 1,
      });
      setQuickWeight("");
      setQuickReps("");
      load();
    } catch (err) {
      setError(err.message || "Log failed.");
    } finally {
      setLogging(false);
    }
  }

  if (!user) return null;

  const coachPayload = {
    week_plan: weekPlan.map((w) => ({
      day: w.day,
      date: w.date,
      kind: w.kind,
      label: w.label,
      done: w.done,
      today: w.today,
    })),
    recent_sessions: sessions.slice(0, 6).map((s) => ({
      date: s.session_date,
      sets: allSets
        .filter((st) => st.session?.session_date === s.session_date)
        .map((st) => `${st.exercise} ${st.weight}×${st.reps}`),
    })),
    lift_progress: liftProgress.map((l) => ({
      lift: l.label,
      current_weight: l.currentWeight,
      current_reps: l.currentReps,
      sessions: l.sessionCount,
    })),
    latest_bodyweight: latestWeight?.w || null,
    last_7_avg: last7 || null,
  };

  return (
    <PSShell scope="fitness" title="Body & Training" coachPayload={coachPayload} coachPayloadReady={!loading}>
      <div className="ps-view">
          <div className="ps-eyebrow">Protocol · Occam + sprints + rower</div>
          <h1 className="ps-title">Body &amp; Training</h1>
          <p className="ps-sub">
            Occam minimal effective dose, O&apos;Mara sprints, water rower
            intervals. Cadence: 5s up / 5s down, 1 working set to failure (7+
            reps target).
          </p>

          {error && <div className="today-error">{error}</div>}

          <div className="fit-week">
            {weekPlan.map((w, i) => (
              <div
                key={i}
                className={
                  "fit-week-day" +
                  (w.today ? " today" : "") +
                  (w.done ? " done" : "")
                }
              >
                <div className="fit-week-dow">{w.day}</div>
                <div className="fit-week-date">{w.date}</div>
                <div className="fit-week-block" style={{ background: w.color }}>
                  <div className="fit-week-label">{w.label}</div>
                  <div className="fit-week-sub">{w.sub}</div>
                </div>
                {w.done && <div className="fit-week-done">✓</div>}
              </div>
            ))}
          </div>

          {nextSession && (
            <div className="fit-next">
              <div className="fit-next-cap">
                Next session · today {nextSession.date}
              </div>
              <div className="fit-next-title">
                {nextSession.label} · {nextSession.sub}
              </div>
              <div className="fit-next-note">
                5s up / 5s down · 1×7+ on the top set · 48h minimum recovery
                before the next heavy day.
              </div>
            </div>
          )}

          <div className="ps-section-title">Month at a glance</div>
          <div className="ps-section-sub">
            Logged exercises per day.{" "}
            {occamSchedule?.mode === "recovery"
              ? `In 48h recovery — next heavy ${occamSchedule.dueWorkout} eligible ${
                  nextEligibleDateStr
                    ? new Date(nextEligibleDateStr + "T00:00:00").toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" }
                      )
                    : "soon"
                }.`
              : occamSchedule?.dueWorkout
              ? `Next heavy session: ${occamSchedule.dueWorkout}.`
              : ""}
          </div>
          <div className="fit-cal-wrap">
            <OccamMonthCalendar
              year={calYear}
              monthIndex={calMonth}
              onPrevMonth={() => shiftMonth(-1)}
              onNextMonth={() => shiftMonth(1)}
              todayStr={todayStr}
              setsByDate={setsByDate}
              nextEligibleDateStr={nextEligibleDateStr}
            />
          </div>

          <div className="ps-section-title">Strength · Occam lifts</div>
          <div className="ps-section-sub">
            Current top-set weight and session history from your lifting logs.
          </div>
          <div className="fit-lifts">
            {loading && <div className="fit-empty">Loading…</div>}
            {!loading &&
              liftProgress.map((l) => (
                <div key={l.id} className="fit-lift-card">
                  <div className="fit-lift-head">
                    <div className="fit-lift-tag" style={{ background: l.color }}>
                      {l.workout}
                    </div>
                    <div className="fit-lift-label">{l.label}</div>
                  </div>
                  <div className="fit-lift-num">
                    {l.currentWeight ? (
                      <>
                        {l.currentWeight}
                        <span className="fit-lift-unit">
                          lb × {l.currentReps || "—"}
                        </span>
                      </>
                    ) : (
                      <span className="fit-lift-empty">No sets yet</span>
                    )}
                  </div>
                  <Sparkline points={l.series} color={l.color} />
                  <div className="fit-lift-meta">
                    {l.sessionCount} session
                    {l.sessionCount === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
          </div>

          <form className="fit-quick" onSubmit={handleQuickLog}>
            <div className="fit-quick-label">Log a top set</div>
            <select
              value={quickLift}
              onChange={(e) => setQuickLift(e.target.value)}
            >
              {OCCAM_LIFTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Weight (lb)"
              value={quickWeight}
              onChange={(e) => setQuickWeight(e.target.value)}
              step="5"
            />
            <input
              type="number"
              placeholder="Reps"
              value={quickReps}
              onChange={(e) => setQuickReps(e.target.value)}
            />
            <button
              className="ps-btn ps-btn--primary"
              type="submit"
              disabled={!quickWeight || !quickReps || logging}
            >
              {logging ? "Logging…" : "Log set"}
            </button>
          </form>

          <div className="ps-section-title">Body composition</div>
          <div className="ps-section-sub">
            Body weight trend · log a new measurement below.
          </div>
          <div className="fit-bw">
            <div className="fit-bw-now">
              <div className="fit-bw-big">
                {latestWeight ? (
                  <>
                    {latestWeight.w.toFixed(1)}
                    <span>lb</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="fit-bw-cap">Latest weight</div>
              {last7 != null && (
                <div className="fit-bw-sub">
                  7-day avg: {last7.toFixed(1)} lb
                </div>
              )}
            </div>
            <div className="fit-bw-chart">
              {bodyweightSeries.length >= 2 ? (
                <Sparkline points={bodyweightSeries} color="var(--ps-accent)" />
              ) : (
                <div className="fit-empty">
                  Log a few weights to see the trend.
                </div>
              )}
            </div>
            <form className="fit-bw-form" onSubmit={handleWeightLog}>
              <input
                type="number"
                step="0.1"
                placeholder="Weight (lb)"
                value={addWeight}
                onChange={(e) => setAddWeight(e.target.value)}
              />
              <button
                type="submit"
                className="ps-btn ps-btn--primary"
                disabled={!addWeight || addingWeight}
              >
                {addingWeight ? "…" : "Log"}
              </button>
            </form>
          </div>

          <div className="ps-section-title">Session log</div>
          <div className="fit-log">
            {sessions.length === 0 ? (
              <div className="fit-empty">No sessions yet.</div>
            ) : (
              sessions.slice(0, 10).map((s) => {
                const setsForSession = allSets.filter(
                  (st) => st.session?.session_date === s.session_date
                );
                const lifts = setsForSession
                  .map(
                    (st) =>
                      `${st.exercise} ${st.weight || "-"}×${st.reps || "-"}`
                  )
                  .join(" · ");
                return (
                  <div key={s.id} className="fit-log-row">
                    <div className="fit-log-date">
                      {new Date(s.session_date + "T00:00:00").toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" }
                      )}
                    </div>
                    <div className="fit-log-lifts">
                      {lifts || "(no sets logged)"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      <style jsx global>{`
        .fit-cal-wrap {
          margin-top: 12px;
        }
        .fit-cal-wrap .rs-section-card {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
          padding: 16px 18px;
        }
        .fit-cal-wrap .rs-section-card__title {
          font-family: var(--ps-serif);
          color: var(--ps-ink);
        }
        .fit-cal-wrap .rs-section-card__subtitle {
          font-size: 12px;
          color: var(--ps-ink-60);
        }
        .fit-week {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          margin-top: 24px;
        }
        .fit-week-day {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
          min-height: 110px;
        }
        .fit-week-day.today {
          border-color: var(--ps-accent);
          box-shadow: 0 0 0 2px var(--ps-accent-soft);
        }
        .fit-week-day.done { opacity: 0.65; }
        .fit-week-dow {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
        }
        .fit-week-date {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: var(--ps-ink-40);
        }
        .fit-week-block {
          border-radius: 6px;
          padding: 6px 8px;
          color: #fff;
          flex: 1;
        }
        .fit-week-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .fit-week-sub {
          font-size: 10.5px;
          margin-top: 2px;
          opacity: 0.9;
        }
        .fit-week-done {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--ps-sage);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          line-height: 1;
        }
        .fit-next {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-radius: 14px;
          padding: 20px 22px;
          margin-top: 18px;
        }
        .fit-next-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(250, 247, 242, 0.6);
          margin-bottom: 6px;
        }
        .fit-next-title {
          font-family: var(--ps-serif);
          font-size: 22px;
          letter-spacing: -0.01em;
          margin-bottom: 6px;
        }
        .fit-next-note {
          font-size: 13px;
          color: rgba(250, 247, 242, 0.75);
          line-height: 1.5;
        }
        .fit-lifts {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 12px;
        }
        .fit-lift-card {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 14px;
        }
        .fit-lift-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .fit-lift-tag {
          font-family: var(--ps-mono);
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          width: 20px;
          height: 20px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fit-lift-label { font-size: 13px; color: var(--ps-ink-70); }
        .fit-lift-num {
          font-family: var(--ps-serif);
          font-size: 28px;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--ps-ink);
          margin-bottom: 6px;
        }
        .fit-lift-unit {
          font-size: 12px;
          color: var(--ps-ink-50);
          margin-left: 6px;
        }
        .fit-lift-empty {
          font-size: 14px;
          color: var(--ps-ink-40);
          font-style: italic;
        }
        .fit-lift-meta {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
          margin-top: 4px;
        }
        .fit-spark {
          margin-top: 4px;
          display: block;
        }
        .fit-quick {
          margin-top: 14px;
          padding: 14px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          display: grid;
          grid-template-columns: auto 1fr auto auto auto;
          gap: 10px;
          align-items: center;
        }
        .fit-quick-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .fit-quick select,
        .fit-quick input {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          padding: 7px 10px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          color: var(--ps-ink);
        }
        .fit-bw {
          display: grid;
          grid-template-columns: 180px 1fr auto;
          gap: 16px;
          margin-top: 12px;
          padding: 14px 16px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          align-items: center;
        }
        .fit-bw-big {
          font-family: var(--ps-serif);
          font-size: 40px;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--ps-ink);
        }
        .fit-bw-big span {
          font-size: 16px;
          color: var(--ps-ink-50);
          margin-left: 4px;
        }
        .fit-bw-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-top: 2px;
        }
        .fit-bw-sub {
          font-size: 12px;
          color: var(--ps-ink-70);
          margin-top: 6px;
        }
        .fit-bw-chart {
          display: flex;
          justify-content: flex-end;
          overflow: hidden;
        }
        .fit-bw-chart svg {
          width: 100%;
          height: 50px;
        }
        .fit-bw-form {
          display: flex;
          gap: 8px;
        }
        .fit-bw-form input {
          width: 110px;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          font-family: inherit;
          font-size: 13px;
        }
        .fit-log {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .fit-log-row {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 12px;
          padding: 10px 14px;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          font-size: 12.5px;
        }
        .fit-log-date {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
        }
        .fit-log-lifts {
          font-family: var(--ps-mono);
          font-size: 11.5px;
          color: var(--ps-ink-70);
          line-height: 1.4;
        }
        .fit-empty {
          font-size: 13px;
          color: var(--ps-ink-60);
          font-style: italic;
          padding: 14px 0;
        }
        @media (max-width: 900px) {
          .fit-week { grid-template-columns: repeat(7, 90px); overflow-x: auto; }
          .fit-lifts { grid-template-columns: 1fr 1fr; }
          .fit-bw { grid-template-columns: 1fr; }
          .fit-quick { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </PSShell>
  );
}
