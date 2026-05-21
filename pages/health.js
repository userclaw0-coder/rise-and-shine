import { useCallback, useEffect, useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import OccamMonthCalendar from "../components/OccamMonthCalendar";
import { useAuth } from "../hooks/useAuth";
import { getOccamScheduleState } from "../lib/occamSchedule";
import { getUserProfile } from "../lib/db";
import {
  getBodyWeightLogs,
  insertBodyWeightLog,
  getBodyMeasurements,
  insertBodyMeasurement,
  getLiftingSessions,
  getLiftingSetsWithSession,
  createLiftingSession,
  addLiftingSet,
  getWellnessSessions,
  insertWellnessSession,
} from "../lib/db";

// Outcome vision-0: 15% body fat, bench 1RM >= bodyweight, squat 1RM >= 2x bodyweight.
const GOALS = { bodyfatPct: 15, benchXbw: 1.0, squatXbw: 2.0 };

// Canonical A/B split (matches OCCAM_LIFTS workout tags + the real logged sessions).
const WORKOUTS = {
  A: { label: "Workout A", sub: "Yates row + barbell press", liftIds: ["yates-row", "barbell-press"] },
  B: { label: "Workout B", sub: "Incline bench + squat", liftIds: ["incline-bench", "squat"] },
};

// US Navy body-fat estimate for men. All inputs in INCHES.
// Returns % or null if inputs incomplete / out of plausible range.
function navyBodyFatMale(neck, waist, height) {
  const n = Number(neck), w = Number(waist), h = Number(height);
  if (!n || !w || !h || w - n <= 0) return null;
  // Reject heights that are obviously not in inches (e.g. someone typed feet)
  // — log10 on a tiny h blows up the result. Adult range is ~48–84 in.
  if (h < 36) return null;
  return 86.01 * Math.log10(w - n) - 70.041 * Math.log10(h) + 36.76;
}

// Format total inches as e.g. 5'10".
function formatFtIn(totalInches) {
  const t = Number(totalInches);
  if (!t || t < 36) return null;
  const ft = Math.floor(t / 12);
  const inch = Math.round(t - ft * 12);
  return `${ft}'${inch}"`;
}

// Epley estimated 1-rep max.
function epley1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps);
  if (!w) return 0;
  return r && r > 1 ? w * (1 + r / 30) : w;
}

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
  {
    id: "kettlebell-swing",
    label: "Kettlebell swing",
    workout: "Acc",
    aliases: ["kettlebell swing", "kb swing", "swings", "kettlebell"],
    color: "#b88a3a",
  },
];

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
  const [measurements, setMeasurements] = useState([]);
  const [mNeck, setMNeck] = useState("");
  const [mWaist, setMWaist] = useState("");
  // (mWeight removed — weight is logged in the dedicated "Add weight" form;
  //  Navy tape method doesn't use body weight as an input.)
  const [mHeightFt, setMHeightFt] = useState("");
  const [mHeightIn, setMHeightIn] = useState("");
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [quickLift, setQuickLift] = useState("yates-row");
  const [quickWeight, setQuickWeight] = useState("");
  const [quickReps, setQuickReps] = useState("");
  const [logging, setLogging] = useState(false);
  const [wellnessSessions, setWellnessSessions] = useState([]);
  const [yogaDuration, setYogaDuration] = useState("");
  const [yogaWithWife, setYogaWithWife] = useState(true);
  const [yogaNote, setYogaNote] = useState("");
  const [savingYoga, setSavingYoga] = useState(false);
  const [profile, setProfile] = useState(null);
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [sessRes, setsRes, wtRes, measRes, wellRes, profileRes] = await Promise.all([
        getLiftingSessions(user.id, 30),
        getLiftingSetsWithSession(user.id, 600),
        getBodyWeightLogs(user.id, 120),
        getBodyMeasurements(user.id, 120),
        getWellnessSessions(user.id, 365),
        getUserProfile(user.id),
      ]);
      if (sessRes.error) throw new Error(sessRes.error.message);
      if (setsRes.error) throw new Error(setsRes.error.message);
      if (wtRes.error) throw new Error(wtRes.error.message);
      // body_measurements + wellness_sessions are newer — tolerate their absence rather than blanking the page.
      if (measRes?.error) console.warn("[health] getBodyMeasurements:", measRes.error.message);
      if (wellRes?.error) console.warn("[health] getWellnessSessions:", wellRes.error.message);
      setSessions(sessRes.data || []);
      setAllSets(setsRes.data || []);
      setWeights(wtRes.data || []);
      setMeasurements(measRes?.data || []);
      setWellnessSessions(wellRes?.data || []);
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

  // Most recent stored height in inches — skip implausibly small values that
  // came from an older bug where feet were stored in this column.
  const knownHeight = useMemo(
    () =>
      measurements.find((m) => Number(m.height_in) >= 36)?.height_in || null,
    [measurements]
  );

  const bodyFatSeries = useMemo(() => {
    return [...measurements]
      .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
      .map((m) => {
        const bf =
          m.bodyfat_pct != null
            ? Number(m.bodyfat_pct)
            : navyBodyFatMale(m.neck_in, m.waist_in, m.height_in || knownHeight);
        return bf == null ? null : { d: m.measured_at, w: Number(bf.toFixed(1)) };
      })
      .filter(Boolean);
  }, [measurements, knownHeight]);

  const latestMeasurement = useMemo(
    () =>
      measurements.length
        ? [...measurements].sort(
            (a, b) => new Date(b.measured_at) - new Date(a.measured_at)
          )[0]
        : null,
    [measurements]
  );

  const latestBodyFat = bodyFatSeries.length
    ? bodyFatSeries[bodyFatSeries.length - 1].w
    : null;

  // Derived mass split: bf% × current body weight. Front-and-centre on the
  // Body composition card so the weight number visibly drives a body-comp metric.
  const fatLb =
    latestWeight?.w && latestBodyFat != null
      ? latestWeight.w * (latestBodyFat / 100)
      : null;
  const leanLb =
    latestWeight?.w && latestBodyFat != null ? latestWeight.w - fatLb : null;
  const fatLbGoal =
    latestWeight?.w ? latestWeight.w * (GOALS.bodyfatPct / 100) : null;

  const measurementDue = useMemo(() => {
    if (!latestMeasurement) return true;
    return (
      Date.now() - new Date(latestMeasurement.measured_at).getTime() >
      7 * 86400000
    );
  }, [latestMeasurement]);

  const strengthStats = useMemo(() => {
    let bench = 0,
      squat = 0;
    for (const s of allSets) {
      const lift = matchLift(s.exercise);
      if (!lift) continue;
      const e = epley1RM(s.weight, s.reps);
      if (lift.id === "incline-bench") bench = Math.max(bench, e);
      if (lift.id === "squat") squat = Math.max(squat, e);
    }
    return { bench: Math.round(bench), squat: Math.round(squat) };
  }, [allSets]);

  // Sticky next workout: flip from the last logged A/B; if it's already been
  // logged today, advance to the other one. Stays put until logged.
  const nextWorkout = useMemo(() => {
    const ts = new Date().toISOString().slice(0, 10);
    const setsOnDay = (day) =>
      allSets.filter(
        (st) => (st.session?.session_date || st.created_at?.slice(0, 10)) === day
      );
    const workoutDoneOn = (label, day) => {
      const lifts = setsOnDay(day).map((st) => matchLift(st.exercise)).filter(Boolean);
      return WORKOUTS[label].liftIds.some((id) => lifts.some((l) => l.id === id));
    };
    const days = [
      ...new Set(
        allSets
          .map((st) => st.session?.session_date || st.created_at?.slice(0, 10))
          .filter(Boolean)
      ),
    ].sort();
    let lastLabel = null;
    for (let i = days.length - 1; i >= 0; i--) {
      const a = workoutDoneOn("A", days[i]);
      const b = workoutDoneOn("B", days[i]);
      if (a && !b) { lastLabel = "A"; break; }
      if (b && !a) { lastLabel = "B"; break; }
    }
    let label = lastLabel === "A" ? "B" : lastLabel === "B" ? "A" : "A";
    const advancedFrom = workoutDoneOn(label, ts) ? label : null;
    if (advancedFrom) label = label === "A" ? "B" : "A";
    return { label, ...WORKOUTS[label], advancedFrom };
  }, [allSets]);

  const goalProgress = useMemo(() => {
    const bw = latestWeight?.w || null;
    const benchGoal = bw ? Math.round(bw * GOALS.benchXbw) : null;
    const squatGoal = bw ? Math.round(bw * GOALS.squatXbw) : null;
    const items = [];
    if (latestBodyFat != null) {
      const start = bodyFatSeries[0]?.w ?? latestBodyFat;
      const pct =
        start > GOALS.bodyfatPct
          ? Math.max(0, Math.min(100, ((start - latestBodyFat) / (start - GOALS.bodyfatPct)) * 100))
          : 100;
      items.push({ key: "bf", label: `Body fat → ${GOALS.bodyfatPct}%`, value: `${latestBodyFat}%`, pct, hit: latestBodyFat <= GOALS.bodyfatPct });
    } else {
      items.push({ key: "bf", label: `Body fat → ${GOALS.bodyfatPct}%`, value: "measure below", pct: 0, hit: false });
    }
    items.push({
      key: "bench",
      label: `Bench → 1× BW${benchGoal ? ` (${benchGoal} lb)` : ""}`,
      value: strengthStats.bench ? `${strengthStats.bench} lb 1RM` : "—",
      pct: benchGoal ? Math.min(100, (strengthStats.bench / benchGoal) * 100) : 0,
      hit: !!(benchGoal && strengthStats.bench >= benchGoal),
    });
    items.push({
      key: "squat",
      label: `Squat → 2× BW${squatGoal ? ` (${squatGoal} lb)` : ""}`,
      value: strengthStats.squat ? `${strengthStats.squat} lb 1RM` : "—",
      pct: squatGoal ? Math.min(100, (strengthStats.squat / squatGoal) * 100) : 0,
      hit: !!(squatGoal && strengthStats.squat >= squatGoal),
    });
    return items;
  }, [latestWeight, latestBodyFat, bodyFatSeries, strengthStats]);

  const setsByDate = useMemo(() => {
    const map = new Map();
    for (const s of allSets) {
      const d = s.session?.session_date || s.created_at?.slice(0, 10);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(s);
    }
    // Surface wellness sessions in the calendar grid alongside lift sets.
    for (const w of wellnessSessions) {
      const d = w.session_date;
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      const label = w.kind === "yoga" ? "Yoga" : w.kind.charAt(0).toUpperCase() + w.kind.slice(1);
      map.get(d).push({ exercise: label, isWellness: true });
    }
    return map;
  }, [allSets, wellnessSessions]);

  // Weekly yoga frequency for the trend sparkline (last 12 ISO-ish weeks, sun-based).
  const yogaWeeklySeries = useMemo(() => {
    const weeks = 12;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - today.getDay());
    const buckets = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(startOfThisWeek);
      start.setDate(startOfThisWeek.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      buckets.push({ start, end, count: 0 });
    }
    for (const w of wellnessSessions) {
      if (w.kind !== "yoga") continue;
      const d = new Date(w.session_date + "T00:00:00");
      for (const b of buckets) {
        if (d >= b.start && d < b.end) {
          b.count += 1;
          break;
        }
      }
    }
    return buckets.map((b) => ({ w: b.count, d: b.start.toISOString().slice(0, 10) }));
  }, [wellnessSessions]);

  const yogaThisWeekCount = yogaWeeklySeries[yogaWeeklySeries.length - 1]?.w || 0;
  const yogaTotalCount = useMemo(
    () => wellnessSessions.filter((w) => w.kind === "yoga").length,
    [wellnessSessions]
  );

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

  async function handleYogaLog(e) {
    e.preventDefault();
    if (!user) return;
    setSavingYoga(true);
    setError("");
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const res = await insertWellnessSession(user.id, {
        kind: "yoga",
        session_date: dateStr,
        duration_min: yogaDuration || null,
        partner: yogaWithWife ? "wife" : null,
        note: yogaNote || null,
      });
      if (res?.error) throw new Error(res.error.message);
      setYogaDuration("");
      setYogaNote("");
      load();
    } catch (err) {
      setError(err.message || "Yoga log failed.");
    } finally {
      setSavingYoga(false);
    }
  }

  async function handleMeasurementLog(e) {
    e.preventDefault();
    if (!user) return;
    const enteredHeight =
      mHeightFt || mHeightIn
        ? Number(mHeightFt || 0) * 12 + Number(mHeightIn || 0)
        : null;
    const height = enteredHeight || knownHeight;
    if (!mNeck && !mWaist) return;
    setSavingMeasure(true);
    setError("");
    try {
      const bf = navyBodyFatMale(mNeck, mWaist, height);
      const res = await insertBodyMeasurement(user.id, {
        neck_in: mNeck,
        waist_in: mWaist,
        height_in: height,
        bodyfat_pct: bf != null ? Number(bf.toFixed(2)) : null,
        bf_method: "navy",
      });
      if (res?.error) throw new Error(res.error.message);
      setMNeck("");
      setMWaist("");
      load();
    } catch (err) {
      setError(err.message || "Failed to save measurement.");
    } finally {
      setSavingMeasure(false);
    }
  }

  if (!user) return null;

  const liveHeight =
    mHeightFt || mHeightIn
      ? Number(mHeightFt || 0) * 12 + Number(mHeightIn || 0)
      : knownHeight;
  const liveBodyFat = navyBodyFatMale(mNeck, mWaist, liveHeight);

  const coachPayload = {
    next_workout: {
      label: nextWorkout.label,
      name: nextWorkout.sub,
      lifts: nextWorkout.liftIds.map((id) => {
        const lp = liftProgress.find((l) => l.id === id);
        return {
          lift: lp?.label || id,
          last_weight: lp?.currentWeight ?? null,
          last_reps: lp?.currentReps ?? null,
        };
      }),
      just_completed_today: !!nextWorkout.advancedFrom,
    },
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
    body_fat_pct: latestBodyFat,
    measurement_due: measurementDue,
    goals: {
      target_bodyfat_pct: GOALS.bodyfatPct,
      bench_est_1rm: strengthStats.bench,
      squat_est_1rm: strengthStats.squat,
      bench_goal_lb: latestWeight?.w ? Math.round(latestWeight.w * GOALS.benchXbw) : null,
      squat_goal_lb: latestWeight?.w ? Math.round(latestWeight.w * GOALS.squatXbw) : null,
    },
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

          {/* Sticky next workout — stays here until it's logged, then flips A↔B. */}
          <div className="fit-next-card">
            <div className="fit-next-head">
              <span className="fit-next-badge">{nextWorkout.label}</span>
              <div>
                <div className="fit-next-name">
                  Next workout ·{" "}
                  {nextWorkout.label === "A" ? "Workout A" : "Workout B"}
                </div>
                <div className="fit-next-sub">{nextWorkout.sub}</div>
              </div>
            </div>
            {nextWorkout.advancedFrom && (
              <div className="fit-next-flag">
                Logged Workout {nextWorkout.advancedFrom} today — up next is{" "}
                {nextWorkout.label}.
              </div>
            )}
            <div className="fit-next-lifts">
              {nextWorkout.liftIds.map((id) => {
                const lp = liftProgress.find((l) => l.id === id);
                return (
                  <div key={id} className="fit-next-lift">
                    <span
                      className="fit-next-lift-dot"
                      style={{ background: lp?.color || "var(--ps-ink-30)" }}
                    />
                    <span className="fit-next-lift-name">{lp?.label || id}</span>
                    <span className="fit-next-lift-last">
                      {lp?.currentWeight
                        ? `last: ${lp.currentWeight} lb × ${lp.currentReps || "—"}`
                        : "no history yet"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="fit-next-note">
              5s up / 5s down · 1×7+ on the top set. Stays here until you log it —
              then it flips to the other day.
            </div>
          </div>

          {/* Progress to the outcome: 15% body fat · 1× bench · 2× squat. */}
          <div className="fit-goals">
            <div className="fit-goals-title">Progress to your outcome</div>
            {goalProgress.map((g) => (
              <div key={g.key} className="fit-goal">
                <div className="fit-goal-top">
                  <span className="fit-goal-label">{g.label}</span>
                  <span className={"fit-goal-val" + (g.hit ? " hit" : "")}>
                    {g.hit ? "✓ " : ""}
                    {g.value}
                  </span>
                </div>
                <div className="fit-goal-bar">
                  <i style={{ width: `${Math.round(g.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>

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

          <div className="ps-section-title">Yoga · movement practice</div>
          <div className="ps-section-sub">
            Yoga with wife (and any other non-strength sessions). Frequency over the last 12 weeks.
          </div>
          <div className="fit-yoga">
            <div className="fit-yoga-stats">
              <div>
                <div className="fit-yoga-big">{yogaThisWeekCount}</div>
                <div className="fit-yoga-meta">this week</div>
              </div>
              <div>
                <div className="fit-yoga-big">{yogaTotalCount}</div>
                <div className="fit-yoga-meta">total logged</div>
              </div>
            </div>
            <div className="fit-yoga-chart">
              {yogaTotalCount > 0 ? (
                <Sparkline points={yogaWeeklySeries} color="#8a6db8" />
              ) : (
                <div className="fit-empty">No yoga sessions yet — log your first below.</div>
              )}
            </div>
          </div>
          <form className="fit-yoga-form" onSubmit={handleYogaLog}>
            <div className="fit-yoga-grid">
              <input
                type="number"
                step="5"
                min="0"
                placeholder="Minutes (optional)"
                value={yogaDuration}
                onChange={(e) => setYogaDuration(e.target.value)}
              />
              <label className="fit-yoga-check">
                <input
                  type="checkbox"
                  checked={yogaWithWife}
                  onChange={(e) => setYogaWithWife(e.target.checked)}
                />
                <span>With wife</span>
              </label>
              <input
                type="text"
                placeholder="Note (optional)"
                value={yogaNote}
                onChange={(e) => setYogaNote(e.target.value)}
              />
              <button
                type="submit"
                className="ps-btn ps-btn--primary"
                disabled={savingYoga}
              >
                {savingYoga ? "…" : "Log yoga"}
              </button>
            </div>
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

          <div className="ps-section-title">
            Body fat · Navy tape method
            {measurementDue && <span className="fit-due"> · due</span>}
          </div>
          <div className="ps-section-sub">
            Neck + waist + height → body-fat %. Two-minute tape check; the trend
            matters more than any single reading.
          </div>
          <div className="fit-bw">
            <div className="fit-bw-now">
              <div className="fit-bw-big">
                {latestBodyFat != null ? (
                  <>
                    {latestBodyFat.toFixed(1)}
                    <span>%</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="fit-bw-cap">Latest body fat</div>
              {fatLb != null && leanLb != null ? (
                <div className="fit-comp-mass">
                  <div className="fit-comp-pill fit-comp-pill--fat">
                    <span className="fit-comp-pill__num">{fatLb.toFixed(1)}</span>
                    <span className="fit-comp-pill__unit">lb fat</span>
                  </div>
                  <div className="fit-comp-pill fit-comp-pill--lean">
                    <span className="fit-comp-pill__num">{leanLb.toFixed(1)}</span>
                    <span className="fit-comp-pill__unit">lb lean</span>
                  </div>
                </div>
              ) : null}
              <div className="fit-bw-sub">
                Goal: {GOALS.bodyfatPct}%
                {fatLbGoal != null && fatLb != null
                  ? ` · drop ${Math.max(0, fatLb - fatLbGoal).toFixed(1)} lb fat`
                  : ""}
              </div>
            </div>
            <div className="fit-bw-chart">
              {bodyFatSeries.length >= 2 ? (
                <Sparkline points={bodyFatSeries} color="var(--ps-sage)" />
              ) : (
                <div className="fit-empty">
                  Log a couple of tape measurements to see the trend.
                </div>
              )}
            </div>
          </div>
          <form className="fit-measure-form" onSubmit={handleMeasurementLog}>
              <div className="fit-measure-grid">
                <label className="fit-measure-field">
                  <span>Neck (in)</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 15"
                    value={mNeck}
                    onChange={(e) => setMNeck(e.target.value)}
                  />
                </label>
                <label className="fit-measure-field">
                  <span>Waist (in)</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 34"
                    value={mWaist}
                    onChange={(e) => setMWaist(e.target.value)}
                  />
                </label>
                <label className="fit-measure-field fit-measure-field--height">
                  <span>
                    Height
                    {knownHeight && !mHeightFt && !mHeightIn
                      ? ` (saved: ${formatFtIn(knownHeight) || `${knownHeight} in`})`
                      : ""}
                  </span>
                  <div className="fit-measure-height-row">
                    <input
                      type="number"
                      min="3"
                      max="8"
                      step="1"
                      placeholder="ft"
                      value={mHeightFt}
                      onChange={(e) => setMHeightFt(e.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      max="11"
                      step="0.1"
                      placeholder="in"
                      value={mHeightIn}
                      onChange={(e) => setMHeightIn(e.target.value)}
                    />
                  </div>
                </label>
              </div>
              <div className="fit-measure-foot">
                <span className="fit-measure-live">
                  {liveBodyFat != null
                    ? `→ ${liveBodyFat.toFixed(1)}% body fat`
                    : "neck + waist + height → live estimate"}
                </span>
                <button
                  type="submit"
                  className="ps-btn ps-btn--primary"
                  disabled={savingMeasure || (!mNeck && !mWaist)}
                >
                  {savingMeasure ? "…" : "Save measurement"}
                </button>
              </div>
          </form>
          {measurements.length > 0 && (
            <div className="fit-measure-log">
              {[...measurements]
                .sort(
                  (a, b) => new Date(b.measured_at) - new Date(a.measured_at)
                )
                .slice(0, 8)
                .map((m) => {
                  const bf =
                    m.bodyfat_pct != null
                      ? Number(m.bodyfat_pct)
                      : navyBodyFatMale(m.neck_in, m.waist_in, m.height_in || knownHeight);
                  return (
                    <div key={m.id} className="fit-measure-row">
                      <span className="fit-measure-date">
                        {new Date(m.measured_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="fit-measure-bf">
                        {bf != null ? `${bf.toFixed(1)}%` : "—"}
                      </span>
                      <span className="fit-measure-meta">
                        {m.neck_in ? `neck ${m.neck_in}"` : ""}
                        {m.neck_in && m.waist_in ? " · " : ""}
                        {m.waist_in ? `waist ${m.waist_in}"` : ""}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}

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
        .fit-comp-mass {
          display: flex; gap: 10px; margin-top: 10px;
        }
        .fit-comp-pill {
          flex: 1 1 0; padding: 10px 12px; border-radius: 10px;
          display: flex; flex-direction: column; gap: 2px;
          background: var(--ps-paper); border: 1px solid var(--ps-ink-08);
        }
        .fit-comp-pill--fat { border-color: rgba(180, 100, 80, 0.28); }
        .fit-comp-pill--lean { border-color: rgba(110, 140, 90, 0.32); }
        .fit-comp-pill__num {
          font-family: var(--ps-mono); font-size: 22px; font-weight: 700;
          line-height: 1; color: var(--ps-ink-90);
        }
        .fit-comp-pill--fat .fit-comp-pill__num { color: var(--ps-clay, #b46450); }
        .fit-comp-pill--lean .fit-comp-pill__num { color: var(--ps-sage, #6e8c5a); }
        .fit-comp-pill__unit {
          font-family: var(--ps-mono); font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--ps-ink-50);
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
        .fit-due { color: var(--ps-clay); font-weight: 600; }

        .fit-next-card {
          margin-top: 24px;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-left: 3px solid var(--ps-accent);
          border-radius: 14px;
          padding: 18px 20px;
        }
        .fit-next-head { display: flex; align-items: center; gap: 14px; }
        .fit-next-badge {
          width: 40px; height: 40px; border-radius: 10px; flex: none;
          background: var(--ps-accent); color: #fff;
          font-family: var(--ps-mono); font-weight: 700; font-size: 18px;
          display: flex; align-items: center; justify-content: center;
        }
        .fit-next-name {
          font-family: var(--ps-mono); font-size: 11px; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--ps-ink-60);
        }
        .fit-next-sub { font-family: var(--ps-serif); font-size: 18px; color: var(--ps-ink); }
        .fit-next-flag {
          margin-top: 12px; font-size: 12.5px; color: var(--ps-sage);
          background: var(--ps-sage-soft); border-radius: 8px; padding: 7px 10px;
        }
        .fit-next-lifts { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
        .fit-next-lift { display: flex; align-items: center; gap: 10px; }
        .fit-next-lift-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .fit-next-lift-name { font-weight: 600; font-size: 14px; }
        .fit-next-lift-last {
          margin-left: auto; font-family: var(--ps-mono);
          font-size: 11.5px; color: var(--ps-ink-60);
        }
        .fit-next-card .fit-next-note { margin-top: 14px; }

        .fit-goals {
          margin-top: 16px; background: #fff; border: 1px solid var(--ps-ink-08);
          border-radius: 14px; padding: 16px 20px;
        }
        .fit-goals-title {
          font-family: var(--ps-serif); font-size: 15px;
          color: var(--ps-ink); margin-bottom: 12px;
        }
        .fit-goal { margin-bottom: 14px; }
        .fit-goal:last-child { margin-bottom: 0; }
        .fit-goal-top {
          display: flex; justify-content: space-between;
          align-items: baseline; font-size: 13px;
        }
        .fit-goal-label { color: var(--ps-ink-80); }
        .fit-goal-val { font-family: var(--ps-mono); font-size: 12px; color: var(--ps-ink-60); }
        .fit-goal-val.hit { color: var(--ps-sage); font-weight: 600; }
        .fit-goal-bar {
          height: 8px; border-radius: 6px; background: var(--ps-ink-08);
          overflow: hidden; margin-top: 6px;
        }
        .fit-goal-bar > i {
          display: block; height: 100%; border-radius: 6px;
          background: var(--ps-accent); transition: width 0.4s ease;
        }

        .fit-yoga {
          display: grid; grid-template-columns: 200px 1fr; gap: 16px;
          align-items: center; padding: 14px;
          border: 1px solid var(--ps-ink-08); border-radius: 12px; background: #fff;
        }
        .fit-yoga-stats { display: flex; gap: 24px; }
        .fit-yoga-big { font-family: var(--ps-mono); font-size: 28px; font-weight: 700; color: #8a6db8; }
        .fit-yoga-meta { font-family: var(--ps-mono); font-size: 11px; color: var(--ps-ink-60); }
        .fit-yoga-chart { min-height: 48px; }
        .fit-yoga-form { margin-top: 10px; }
        .fit-yoga-grid {
          display: grid; grid-template-columns: 160px auto 1fr auto; gap: 8px;
          align-items: center;
        }
        .fit-yoga-grid input[type="number"],
        .fit-yoga-grid input[type="text"] {
          padding: 8px 10px; border-radius: 8px;
          border: 1px solid var(--ps-ink-10); background: var(--ps-paper);
          font-family: inherit; font-size: 13px; width: 100%;
        }
        .fit-yoga-check {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--ps-mono); font-size: 12px; color: var(--ps-ink-60);
          white-space: nowrap;
        }

        .fit-measure-form {
          margin-top: 12px; display: flex; flex-direction: column; gap: 10px;
        }
        .fit-measure-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .fit-measure-grid input {
          width: 100%; padding: 8px 10px; border-radius: 8px;
          border: 1px solid var(--ps-ink-10); background: var(--ps-paper);
          font-family: inherit; font-size: 13px;
        }
        .fit-measure-field {
          display: flex; flex-direction: column; gap: 4px; min-width: 0;
        }
        .fit-measure-field > span {
          font-family: var(--ps-mono); font-size: 11px; color: var(--ps-ink-60);
        }
        .fit-measure-height-row { display: flex; gap: 6px; }
        .fit-measure-height-row input { min-width: 0; }
        .fit-measure-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; flex-wrap: wrap;
        }
        .fit-measure-live { font-family: var(--ps-mono); font-size: 12px; color: var(--ps-sage); }
        .fit-measure-log {
          margin-top: 12px; border: 1px solid var(--ps-ink-08);
          border-radius: 12px; overflow: hidden; background: #fff;
        }
        .fit-measure-row {
          display: flex; align-items: center; gap: 12px; padding: 9px 14px;
          border-bottom: 1px solid var(--ps-ink-05); font-size: 13px;
        }
        .fit-measure-row:last-child { border-bottom: none; }
        .fit-measure-date {
          font-family: var(--ps-mono); font-size: 11px;
          color: var(--ps-ink-60); width: 56px; flex: none;
        }
        .fit-measure-bf { font-weight: 700; color: var(--ps-sage); width: 56px; flex: none; }
        .fit-measure-meta { color: var(--ps-ink-60); font-family: var(--ps-mono); font-size: 11px; }

        @media (max-width: 900px) {
          .fit-week { grid-template-columns: repeat(7, 90px); overflow-x: auto; }
          .fit-lifts { grid-template-columns: 1fr 1fr; }
          .fit-bw { grid-template-columns: 1fr; }
          .fit-quick { grid-template-columns: 1fr 1fr; }
          .fit-measure-grid { grid-template-columns: 1fr 1fr; }
          .fit-yoga { grid-template-columns: 1fr; }
          .fit-yoga-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </PSShell>
  );
}
