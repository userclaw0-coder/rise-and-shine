import { useEffect, useRef, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getCompletedEventsInRange,
  getLastCompletedEventsWithTasks,
  getWeeklyReviewWeeks,
  getPlannerRefinementEventsInRange,
  getWeeklyReview,
  getDailyTemplateTaskIds,
  getBacklogTasks,
} from "../lib/db";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { countRefinementActions } from "../lib/planner-refinement-events";
import { getOutcomeLabel } from "../lib/scoring";

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Local date YYYY-MM-DD for grouping and display. */
function dateStrLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday of the given date's week (YYYY-MM-DD). */
function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

const HUMAN_NEEDS_KEYS = [
  "certainty",
  "variety",
  "significance",
  "connection",
  "growth",
  "contribution",
];
const HUMAN_NEEDS_LABELS = {
  certainty: "Certainty",
  variety: "Variety",
  significance: "Significance",
  connection: "Love & Connection",
  growth: "Growth",
  contribution: "Contribution",
};

function formatWeekLabel(weekStartStr) {
  if (!weekStartStr) return "";
  const d = new Date(weekStartStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MeasuredChart({ height = 220, renderChart }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    let rafId = 0;
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.floor(rect?.width || 0)),
        height: Math.max(0, Math.floor(rect?.height || 0)),
      };
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const ready = size.width > 0 && size.height > 0;

  return (
    <div style={{ width: "100%", minWidth: 0, height }} ref={containerRef}>
      {ready ? renderChart(size) : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sevenDayData, setSevenDayData] = useState([]);
  const [thirtyDayData, setThirtyDayData] = useState([]);
  const [hourHistogram, setHourHistogram] = useState([]);
  const [lastCompleted, setLastCompleted] = useState([]);
  const [weeklyStreak, setWeeklyStreak] = useState(0);
  const [plannerRefinementMetrics, setPlannerRefinementMetrics] = useState({
    accepted: 0,
    dismissed: 0,
    applied: 0,
  });
  const [humanNeedsRadarData, setHumanNeedsRadarData] = useState([]);
  const [humanNeedsWeekLabels, setHumanNeedsWeekLabels] = useState({
    older: "",
    newer: "",
  });
  const [summaryMetrics, setSummaryMetrics] = useState({
    daysActive7: 0,
    daysActive30: 0,
    thisWeekTotal: 0,
    lastWeekTotal: 0,
    dailyHitsRate7: null,
  });
  const [puttingOff, setPuttingOff] = useState({ overdue: 0, highPriorityOpen: 0 });
  const [completionsByCategory, setCompletionsByCategory] = useState([]);
  const [outcomeProgress, setOutcomeProgress] = useState([]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError("");
      const today = new Date();
      const start7 = addDays(today, -7);
      const start30 = addDays(today, -30);

      try {
        const [range7, range30, last, weeks, plannerRefinements, dailyTaskIdsRes, backlogOpen, backlogAll] = await Promise.all([
          getCompletedEventsInRange(user.id, dateStrLocal(start7), dateStrLocal(today)),
          getCompletedEventsInRange(user.id, dateStrLocal(start30), dateStrLocal(today)),
          getLastCompletedEventsWithTasks(user.id, 50),
          getWeeklyReviewWeeks(user.id, 52),
          getPlannerRefinementEventsInRange(user.id, dateStr(start30), dateStr(today)),
          getDailyTemplateTaskIds(user.id),
          getBacklogTasks(user.id, { includeArchived: false }),
          getBacklogTasks(user.id, { includeArchived: true }),
        ]);

        const dailyTemplateTaskIds = dailyTaskIdsRes.data || new Set();
        const todayStr = dateStrLocal(today);
        const openTasks = backlogOpen.data || [];
        const allTasks = backlogAll.data || [];
        const tasksById = new Map((allTasks || []).map((t) => [t.id, t]));

        if (range7.error) setError(range7.error.message);
        else {
          const byDay = {};
          for (let i = 0; i <= 7; i++) {
            const d = dateStrLocal(addDays(start7, i));
            byDay[d] = { date: d, daily: 0, other: 0 };
          }
          (range7.data || []).forEach((ev) => {
            const d = dateStrLocal(new Date(ev.created_at));
            if (byDay[d]) {
              if (dailyTemplateTaskIds.has(ev.task_id)) byDay[d].daily += 1;
              else byDay[d].other += 1;
            }
          });
          setSevenDayData(
            Object.keys(byDay)
              .sort()
              .map((d) => ({ ...byDay[d], count: byDay[d].daily + byDay[d].other }))
          );
        }

        if (range30.error) setError(range30.error.message);
        else {
          const byDay = {};
          for (let i = 0; i <= 30; i++) {
            const d = dateStrLocal(addDays(start30, i));
            byDay[d] = { date: d, daily: 0, other: 0 };
          }
          (range30.data || []).forEach((ev) => {
            const d = dateStrLocal(new Date(ev.created_at));
            if (byDay[d]) {
              if (dailyTemplateTaskIds.has(ev.task_id)) byDay[d].daily += 1;
              else byDay[d].other += 1;
            }
          });
          setThirtyDayData(
            Object.keys(byDay)
              .sort()
              .map((d) => ({ ...byDay[d], count: byDay[d].daily + byDay[d].other }))
          );
        }

        const allInRange = [...(range7.data || []), ...(range30.data || [])];
        const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
        allInRange.forEach((ev) => {
          const h = new Date(ev.created_at).getHours();
          byHour[h].count += 1;
        });
        setHourHistogram(byHour);

        if (last.error) setError(last.error.message);
        else setLastCompleted(last.data || []);

        if (!weeks.error && weeks.data) {
          const dates = (weeks.data || [])
            .map((w) => w.week_start)
            .filter(Boolean)
            .sort()
            .reverse();
          const seen = new Set(dates);
          let streak = 0;
          const todayStrVal = dateStr(today);
          const todayDate = new Date(todayStrVal);
          for (let i = 0; i < 104; i++) {
            const d = new Date(todayDate);
            d.setUTCDate(d.getUTCDate() - i * 7);
            const weekStartIso = d.toISOString().slice(0, 10);
            if (seen.has(weekStartIso)) streak += 1;
            else break;
          }
          setWeeklyStreak(streak);
        }

        if (plannerRefinements.error) setError(plannerRefinements.error.message);
        else {
          const events = plannerRefinements.data || [];
          setPlannerRefinementMetrics(countRefinementActions(events));
        }

        const thisWeekMonday = getWeekStart(today);
        const prevWeekStart = dateStr(addDays(new Date(thisWeekMonday + "T12:00:00Z"), -7));
        const twoWeeksAgoStart = dateStr(addDays(new Date(thisWeekMonday + "T12:00:00Z"), -14));
        const [reviewOlder, reviewNewer] = await Promise.all([
          getWeeklyReview(user.id, twoWeeksAgoStart),
          getWeeklyReview(user.id, prevWeekStart),
        ]);
        const scoresOlder = (reviewOlder.data && reviewOlder.data.scores) || {};
        const scoresNewer = (reviewNewer.data && reviewNewer.data.scores) || {};
        const radarData = HUMAN_NEEDS_KEYS.map((key) => ({
          subject: HUMAN_NEEDS_LABELS[key],
          key,
          older: typeof scoresOlder[key] === "number" ? scoresOlder[key] : 0,
          newer: typeof scoresNewer[key] === "number" ? scoresNewer[key] : 0,
          fullMark: 10,
        }));
        setHumanNeedsRadarData(radarData);
        setHumanNeedsWeekLabels({
          older: twoWeeksAgoStart,
          newer: prevWeekStart,
        });

        const datesWithCompletions7 = new Set((range7.data || []).map((ev) => dateStrLocal(new Date(ev.created_at))));
        const datesWithCompletions30 = new Set((range30.data || []).map((ev) => dateStrLocal(new Date(ev.created_at))));
        const totalThisWeek = (range7.data || []).length;
        const start14 = addDays(today, -14);
        const range14Res = await getCompletedEventsInRange(user.id, dateStrLocal(start14), dateStrLocal(today));
        const range14 = range14Res.data || [];
        const lastWeekTotal = range14.filter((ev) => {
          const d = dateStrLocal(new Date(ev.created_at));
          return d >= dateStrLocal(start14) && d < dateStrLocal(start7);
        }).length;
        const dailySize = dailyTemplateTaskIds.size || 1;
        const totalDailyIn7 = sevenDayData.reduce((s, row) => s + (row.daily || 0), 0);
        const maxDailyPossible = dailySize * 7;
        setSummaryMetrics({
          daysActive7: datesWithCompletions7.size,
          daysActive30: datesWithCompletions30.size,
          thisWeekTotal: totalThisWeek,
          lastWeekTotal,
          dailyHitsRate7: maxDailyPossible > 0 ? Math.round((totalDailyIn7 / maxDailyPossible) * 100) : null,
        });

        const overdue = openTasks.filter((t) => t.due_date && dateStrLocal(new Date(t.due_date)) < todayStr).length;
        const highPriorityOpen = openTasks.filter((t) => (t.priority === "Critical" || t.priority === "High")).length;
        setPuttingOff({ overdue, highPriorityOpen });

        const categoryCounts = {};
        (range30.data || []).forEach((ev) => {
          const task = tasksById.get(ev.task_id);
          const name = (task?.category?.name ?? "Uncategorized").trim() || "Uncategorized";
          categoryCounts[name] = (categoryCounts[name] || 0) + 1;
        });
        const byCategory = Object.entries(categoryCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setCompletionsByCategory(byCategory);

        const byOutcome = new Map();
        Object.entries(categoryCounts).forEach(([catName, count]) => {
          const label = getOutcomeLabel(catName) || catName;
          byOutcome.set(label, (byOutcome.get(label) || 0) + count);
        });
        setOutcomeProgress(
          Array.from(byOutcome.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
        );
      } catch (e) {
        setError(e.message || "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  if (loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Analytics
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Completion momentum, time-of-day, weekly reviews, and recent activity.
        </p>
        {weeklyStreak > 0 && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "#059669",
            }}
          >
            Weekly review streak: {weeklyStreak} week{weeklyStreak === 1 ? "" : "s"}.
          </p>
        )}

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
            marginTop: 16,
          }}
        >
          <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 13 }}>
            <div style={{ color: "#166534", fontWeight: 600 }}>{summaryMetrics.daysActive7}</div>
            <div style={{ color: "#15803d", fontSize: 11 }}>Days active (7d)</div>
          </div>
          <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 13 }}>
            <div style={{ color: "#166534", fontWeight: 600 }}>{summaryMetrics.daysActive30}</div>
            <div style={{ color: "#15803d", fontSize: 11 }}>Days active (30d)</div>
          </div>
          <div style={{ padding: "10px 12px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 13 }}>
            <div style={{ color: "#1d4ed8", fontWeight: 600 }}>{summaryMetrics.thisWeekTotal} vs {summaryMetrics.lastWeekTotal}</div>
            <div style={{ color: "#2563eb", fontSize: 11 }}>This week vs last week</div>
          </div>
          {summaryMetrics.dailyHitsRate7 != null && (
            <div style={{ padding: "10px 12px", borderRadius: 12, background: "#fefce8", border: "1px solid #fef08a", fontSize: 13 }}>
              <div style={{ color: "#854d0e", fontWeight: 600 }}>{summaryMetrics.dailyHitsRate7}%</div>
              <div style={{ color: "#a16207", fontSize: 11 }}>Daily hits (7d)</div>
            </div>
          )}
        </div>

        {(puttingOff.overdue > 0 || puttingOff.highPriorityOpen > 0) && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#991b1b" }}>
              What you might be putting off
            </h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
              {puttingOff.overdue > 0 && (
                <span style={{ color: "#b91c1c" }}>
                  <strong>{puttingOff.overdue}</strong> overdue task{puttingOff.overdue === 1 ? "" : "s"}
                </span>
              )}
              {puttingOff.highPriorityOpen > 0 && (
                <span style={{ color: "#b91c1c" }}>
                  <strong>{puttingOff.highPriorityOpen}</strong> open Critical/High priority
                </span>
              )}
            </div>
          </div>
        )}

        <style>{`
          .analytics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 20px; }
          @media (max-width: 768px) { .analytics-grid { grid-template-columns: 1fr; } }
        `}</style>
        <div className="analytics-grid">
        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "linear-gradient(180deg, #fafbfc 0%, #fff 100%)",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "#111827" }}>
            Six Human Needs — change over time
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            Your needs scores from the two previous weeks (1–10). Overlap shows where scores stayed similar.
          </p>
          {humanNeedsRadarData.some((d) => d.older > 0 || d.newer > 0) ? (
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  data={humanNeedsRadarData}
                  margin={{ top: 24, right: 24, bottom: 24, left: 24 }}
                >
                  <PolarGrid stroke="#e5e7eb" strokeOpacity={0.8} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 12, fill: "#4b5563" }}
                    tickLine={false}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 10]}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickCount={6}
                  />
                  <Radar
                    name={humanNeedsWeekLabels.older ? `Week of ${formatWeekLabel(humanNeedsWeekLabels.older)}` : "2 weeks ago"}
                    dataKey="older"
                    stroke="#64748b"
                    fill="#64748b"
                    fillOpacity={0.35}
                    strokeWidth={1.5}
                  />
                  <Radar
                    name={humanNeedsWeekLabels.newer ? `Week of ${formatWeekLabel(humanNeedsWeekLabels.newer)}` : "Last week"}
                    dataKey="newer"
                    stroke="#0d9488"
                    fill="#14b8a6"
                    fillOpacity={0.55}
                    strokeWidth={2}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => <span style={{ color: "#374151" }}>{value}</span>}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              Complete at least one weekly review (with needs scores) to see your chart here.
            </p>
          )}
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            Planner refinement analytics (last 30 days)
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#ecfdf5", color: "#065f46", fontSize: 13 }}>
              Accepted: <strong>{plannerRefinementMetrics.accepted}</strong>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#eff6ff", color: "#1d4ed8", fontSize: 13 }}>
              Applied: <strong>{plannerRefinementMetrics.applied}</strong>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#f9fafb", color: "#374151", fontSize: 13 }}>
              Dismissed: <strong>{plannerRefinementMetrics.dismissed}</strong>
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            7-day momentum (tasks completed per day)
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
            Bottom: daily template tasks. Top: other tasks.
          </p>
          <MeasuredChart
            renderChart={({ width, height }) => (
              <BarChart width={width} height={height} data={sevenDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="daily" name="Daily tasks" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" name="Other tasks" stackId="a" fill="#374151" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          />
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            30-day momentum
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
            Bottom: daily template tasks. Top: other tasks.
          </p>
          <MeasuredChart
            renderChart={({ width, height }) => (
              <BarChart width={width} height={height} data={thirtyDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="daily" name="Daily tasks" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" name="Other tasks" stackId="a" fill="#374151" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          />
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            Completion time of day (local hour)
          </h2>
          <MeasuredChart
            renderChart={({ width, height }) => (
              <BarChart width={width} height={height} data={hourHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          />
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            Progress by category (30 days)
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
            Where your completions landed — helps see balance toward goals.
          </p>
          {completionsByCategory.length > 0 ? (
            <MeasuredChart
              height={260}
              renderChart={({ width, height }) => (
                <BarChart width={width} height={height} data={completionsByCategory} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} name="Completions" />
                </BarChart>
              )}
            />
          ) : (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Complete tasks to see breakdown by category.</p>
          )}
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "linear-gradient(180deg, #f0fdf4 0%, #fff 100%)",
            borderRadius: 16,
            border: "1px solid #bbf7d0",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px", color: "#14532d" }}>
            Progress toward outcomes (30 days)
          </h2>
          <p style={{ fontSize: 12, color: "#166534", margin: "0 0 8px" }}>
            Completions that advance each outcome area — your goals in motion.
          </p>
          {outcomeProgress.length > 0 ? (
            <MeasuredChart
              height={260}
              renderChart={({ width, height }) => (
                <BarChart width={width} height={height} data={outcomeProgress} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={76} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} name="Completions" />
                </BarChart>
              )}
            />
          ) : (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              Complete tasks in categorized areas to see progress toward your outcomes.
            </p>
          )}
        </section>

        <section
          style={{
            marginTop: 0,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            gridColumn: "1 / -1",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            Completed tasks with timestamps (last 50)
          </h2>
          {lastCompleted.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              No completed events yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 8px 6px" }}>Task</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 6px" }}>Completed at</th>
                  </tr>
                </thead>
                <tbody>
                  {lastCompleted.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px" }}>
                        {ev.task?.title ?? ev.task_id}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#6b7280" }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
