import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import {
  getCompletedEventsInRange,
  getLastCompletedEventsWithTasks,
  getWeeklyReviewWeeks,
  getPlannerRefinementEventsInRange,
  getWeeklyReview,
  getBacklogTasks,
  getCategoriesWithSubcategories,
  getUserProfile,
  listWeeklyImprovementRuns,
} from "../lib/db";
import {
  BarChart,
  Bar,
  LabelList,
  LineChart,
  Line,
  AreaChart,
  Area,
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
import { getHumanNeedStrategyLabel } from "../lib/humanNeedStrategies";
import { computeProjectAlignment, mergeProjectWorkspace } from "../lib/projectWorkspace";
import { buildImprovementLabReport } from "../lib/weeklyImprovementContext";

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

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

function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStartStr) {
  if (!weekStartStr) return "";
  const d = new Date(weekStartStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortenChartLabel(value, max = 26) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
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

const SERIES_COLORS = [
  "var(--ps-accent)",
  "var(--ps-indigo)",
  "var(--ps-sage)",
  "var(--ps-plum)",
  "var(--ps-gold)",
  "var(--ps-clay)",
];

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

  const [summaryMetrics, setSummaryMetrics] = useState({
    daysActive7: 0,
    daysActive30: 0,
    thisWeekTotal: 0,
    lastWeekTotal: 0,
    weeklyReviewStreak: 0,
    activeStreakDays: 0,
  });
  const [puttingOff, setPuttingOff] = useState({ overdue: 0, highPriorityOpen: 0 });

  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [decisiveRhythm, setDecisiveRhythm] = useState([]);
  const [outcomeMomentum, setOutcomeMomentum] = useState({ weeks: [], series: [] });
  const [projectContribution, setProjectContribution] = useState({ weeks: [], series: [] });
  const [humanNeedsRadarData, setHumanNeedsRadarData] = useState([]);
  const [humanNeedsWeekLabels, setHumanNeedsWeekLabels] = useState({ older: "", newer: "" });

  const [hourHistogram, setHourHistogram] = useState([]);
  const [completionsByCategory, setCompletionsByCategory] = useState([]);
  const [completionsByOutcome, setCompletionsByOutcome] = useState([]);
  const [completionsByLifeDomain, setCompletionsByLifeDomain] = useState([]);

  const [plannerRefinementMetrics, setPlannerRefinementMetrics] = useState({
    accepted: 0,
    dismissed: 0,
    applied: 0,
  });
  const [improvementLabReport, setImprovementLabReport] = useState(null);
  const [lastCompleted, setLastCompleted] = useState([]);

  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    function handleWindowFocus() {
      setRefreshNonce((v) => v + 1);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setRefreshNonce((v) => v + 1);
      }
    }
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError("");
      const today = new Date();
      const start7 = addDays(today, -7);
      const start30 = addDays(today, -30);
      const start84 = addDays(today, -83);

      try {
        const [
          range7,
          range30,
          range84,
          last,
          weeks,
          plannerRefinements,
          backlogAll,
          categoriesRes,
          profileRes,
          improvementRunsRes,
        ] = await Promise.all([
          getCompletedEventsInRange(user.id, dateStrLocal(start7), dateStrLocal(today)),
          getCompletedEventsInRange(user.id, dateStrLocal(start30), dateStrLocal(today)),
          getCompletedEventsInRange(user.id, dateStrLocal(start84), dateStrLocal(today)),
          getLastCompletedEventsWithTasks(user.id, 50),
          getWeeklyReviewWeeks(user.id, 52),
          getPlannerRefinementEventsInRange(user.id, dateStr(start30), dateStr(today)),
          getBacklogTasks(user.id, { includeArchived: true }),
          getCategoriesWithSubcategories(user.id),
          getUserProfile(user.id),
          listWeeklyImprovementRuns(user.id, 12),
        ]);

        if (range7.error) setError(range7.error.message);
        if (range30.error) setError(range30.error.message);
        if (range84.error) setError(range84.error.message);

        const allTasks = backlogAll.data || [];
        const tasksById = new Map((allTasks || []).map((t) => [t.id, t]));
        const openTasks = allTasks.filter((t) => !t.archived_at && t.status !== "done");

        // Hour-of-day histogram (30d)
        const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
        (range30.data || []).forEach((ev) => {
          const h = new Date(ev.created_at).getHours();
          byHour[h].count += 1;
        });
        setHourHistogram(byHour);

        if (last.error) setError(last.error.message);
        else setLastCompleted(last.data || []);

        // Weekly review streak (consecutive weeks with a review)
        let weeklyReviewStreak = 0;
        if (!weeks.error && weeks.data) {
          const seen = new Set(
            (weeks.data || []).map((w) => w.week_start).filter(Boolean)
          );
          const todayDate = new Date(dateStr(today));
          for (let i = 0; i < 104; i++) {
            const d = new Date(todayDate);
            d.setUTCDate(d.getUTCDate() - i * 7);
            if (seen.has(d.toISOString().slice(0, 10))) weeklyReviewStreak += 1;
            else break;
          }
        }

        if (plannerRefinements.error) setError(plannerRefinements.error.message);
        else setPlannerRefinementMetrics(countRefinementActions(plannerRefinements.data || []));

        if (!improvementRunsRes.error) {
          setImprovementLabReport(buildImprovementLabReport(improvementRunsRes.data || []));
        }

        // Needs radar (2-week compare)
        const thisWeekMonday = getWeekStart(today);
        const prevWeekStart = dateStr(addDays(new Date(thisWeekMonday + "T12:00:00Z"), -7));
        const twoWeeksAgoStart = dateStr(addDays(new Date(thisWeekMonday + "T12:00:00Z"), -14));
        const [reviewOlder, reviewNewer] = await Promise.all([
          getWeeklyReview(user.id, twoWeeksAgoStart),
          getWeeklyReview(user.id, prevWeekStart),
        ]);
        const scoresOlder = (reviewOlder.data && reviewOlder.data.scores) || {};
        const scoresNewer = (reviewNewer.data && reviewNewer.data.scores) || {};
        setHumanNeedsRadarData(
          HUMAN_NEEDS_KEYS.map((key) => ({
            subject: HUMAN_NEEDS_LABELS[key],
            key,
            older: typeof scoresOlder[key] === "number" ? scoresOlder[key] : 0,
            newer: typeof scoresNewer[key] === "number" ? scoresNewer[key] : 0,
            fullMark: 10,
          }))
        );
        setHumanNeedsWeekLabels({ older: twoWeeksAgoStart, newer: prevWeekStart });

        // Summary KPIs
        const datesWithCompletions7 = new Set(
          (range7.data || []).map((ev) => dateStrLocal(new Date(ev.created_at)))
        );
        const datesWithCompletions30 = new Set(
          (range30.data || []).map((ev) => dateStrLocal(new Date(ev.created_at)))
        );
        const thisWeekTotal = (range7.data || []).length;
        const range14Res = await getCompletedEventsInRange(
          user.id,
          dateStrLocal(addDays(today, -14)),
          dateStrLocal(today)
        );
        const range14 = range14Res.data || [];
        const lastWeekTotal = range14.filter((ev) => {
          const d = dateStrLocal(new Date(ev.created_at));
          return d >= dateStrLocal(addDays(today, -14)) && d < dateStrLocal(start7);
        }).length;

        // Active streak days — consecutive days ending today with ≥1 completion
        let activeStreakDays = 0;
        let cursor = new Date(`${dateStrLocal(today)}T12:00:00`);
        const daysWithCompletions = new Set(
          (range84.data || []).map((ev) => dateStrLocal(new Date(ev.created_at)))
        );
        while (daysWithCompletions.has(dateStrLocal(cursor))) {
          activeStreakDays += 1;
          cursor = addDays(cursor, -1);
        }

        setSummaryMetrics({
          daysActive7: datesWithCompletions7.size,
          daysActive30: datesWithCompletions30.size,
          thisWeekTotal,
          lastWeekTotal,
          weeklyReviewStreak,
          activeStreakDays,
        });

        // --- 12-week weekly completion trend + decisive-action rhythm ---
        const weeksBack = 12;
        const anchor = new Date(getWeekStart(today) + "T12:00:00Z");
        const weekStarts = [];
        for (let i = weeksBack - 1; i >= 0; i--) {
          const ws = new Date(anchor);
          ws.setUTCDate(ws.getUTCDate() - i * 7);
          weekStarts.push(ws.toISOString().slice(0, 10));
        }
        const weekIndex = new Map(weekStarts.map((w, i) => [w, i]));
        const weeklyTotals = weekStarts.map((w) => ({
          week: w,
          label: formatWeekLabel(w),
          count: 0,
        }));
        const decisiveDaysByWeek = weekStarts.map((w) => ({
          week: w,
          label: formatWeekLabel(w),
          days: new Set(),
        }));
        const outcomeByWeek = {};
        const projectByWeek = {};

        const prefs = profileRes?.data?.profile?.preferences || {};
        const allCategoriesList = (categoriesRes?.data || []).map((c) => ({
          id: c.id,
          name: (c?.name || "Uncategorized").trim() || "Uncategorized",
        }));

        (range84.data || []).forEach((ev) => {
          const evDate = new Date(ev.created_at);
          const ws = getWeekStart(evDate);
          const idx = weekIndex.get(ws);
          if (idx == null) return;
          weeklyTotals[idx].count += 1;

          const task = tasksById.get(ev.task_id);
          if (!task) return;
          if (task.priority === "Critical" || task.priority === "High") {
            decisiveDaysByWeek[idx].days.add(dateStrLocal(evDate));
          }
          const outcomeIds = Array.isArray(task.outcome_ids) ? task.outcome_ids : [];
          outcomeIds.forEach((oid) => {
            if (!outcomeByWeek[oid]) outcomeByWeek[oid] = Array(weeksBack).fill(0);
            outcomeByWeek[oid][idx] += 1;
          });
          const catName = (task?.category?.name ?? "Uncategorized").trim() || "Uncategorized";
          if (catName.toLowerCase() === "daily repeat") return;
          if (!projectByWeek[catName]) projectByWeek[catName] = Array(weeksBack).fill(0);
          projectByWeek[catName][idx] += 1;
        });

        setWeeklyTrend(weeklyTotals);
        setDecisiveRhythm(
          decisiveDaysByWeek.map((row) => ({
            week: row.week,
            label: row.label,
            days: row.days.size,
          }))
        );

        // Outcome momentum — top 5 outcomes by total in 12 weeks
        const profile = profileRes?.data?.profile || {};
        const desiredOutcomes = profile.desired_outcomes || [];
        const outcomeLabel = new Map(
          desiredOutcomes.map((o) => [o.id || o.title, o.title || o.id])
        );
        const outcomeRanked = Object.entries(outcomeByWeek)
          .map(([id, arr]) => ({
            id,
            name: outcomeLabel.get(id) || id,
            total: arr.reduce((a, b) => a + b, 0),
            arr,
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);
        const outcomeRows = weekStarts.map((w, i) => {
          const row = { week: w, label: formatWeekLabel(w) };
          outcomeRanked.forEach((o) => {
            row[o.name] = o.arr[i];
          });
          return row;
        });
        setOutcomeMomentum({
          weeks: outcomeRows,
          series: outcomeRanked.map((o) => o.name),
        });

        // Project contribution — top 5 projects by total in 12 weeks
        const projectRanked = Object.entries(projectByWeek)
          .map(([name, arr]) => ({
            name,
            total: arr.reduce((a, b) => a + b, 0),
            arr,
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);
        const projectRows = weekStarts.map((w, i) => {
          const row = { week: w, label: formatWeekLabel(w) };
          projectRanked.forEach((p) => {
            row[p.name] = p.arr[i];
          });
          return row;
        });
        setProjectContribution({
          weeks: projectRows,
          series: projectRanked.map((p) => p.name),
        });

        // --- Putting off ---
        const openTodoDoing = openTasks.filter(
          (t) => t.status === "todo" || t.status === "doing"
        );
        const todayStr = dateStrLocal(today);
        const overdue = openTodoDoing.filter(
          (t) => t.due_date && dateStrLocal(new Date(t.due_date)) < todayStr
        ).length;
        const highPriorityOpen = openTodoDoing.filter(
          (t) => t.priority === "Critical" || t.priority === "High"
        ).length;
        setPuttingOff({ overdue, highPriorityOpen });

        // --- 30-day breakdowns (keep, this is net-new versus weekly review) ---
        const categoryCounts = {};
        const projectAlignmentByCategory = {};
        allCategoriesList.forEach((category) => {
          const catTasks = (allTasks || []).filter(
            (task) => String(task.category_id) === String(category.id)
          );
          const rootTasks = catTasks.filter((task) => !task.parent_task_id);
          const workspace = mergeProjectWorkspace(prefs, category.id);
          projectAlignmentByCategory[category.name] = computeProjectAlignment(
            rootTasks,
            workspace.mantra || "",
            workspace.narrative || ""
          );
        });
        (range30.data || []).forEach((ev) => {
          const task = tasksById.get(ev.task_id);
          const name = (task?.category?.name ?? "Uncategorized").trim() || "Uncategorized";
          if (name.toLowerCase() === "daily repeat") return;
          categoryCounts[name] = (categoryCounts[name] || 0) + 1;
        });
        const byCategory = allCategoriesList
          .filter((c) => c.name.toLowerCase() !== "daily repeat")
          .map((c) => ({
            name: c.name,
            count: categoryCounts[c.name] || 0,
            alignment: projectAlignmentByCategory[c.name] ?? null,
            alignment_label:
              typeof projectAlignmentByCategory[c.name] === "number"
                ? `${projectAlignmentByCategory[c.name]}`
                : "",
          }))
          .concat(
            Object.entries(categoryCounts)
              .filter(([name]) => !allCategoriesList.some((c) => c.name === name))
              .map(([name, count]) => ({
                name,
                count,
                alignment: projectAlignmentByCategory[name] ?? null,
                alignment_label:
                  typeof projectAlignmentByCategory[name] === "number"
                    ? `${projectAlignmentByCategory[name]}`
                    : "",
              }))
          )
          .sort((a, b) => b.count - a.count)
          .filter((row) => row.name.toLowerCase() !== "daily repeat");
        setCompletionsByCategory(byCategory);

        const byOutcomeId = {};
        const byDomain = {};
        (range30.data || []).forEach((ev) => {
          const task = tasksById.get(ev.task_id);
          const outcomeIds = Array.isArray(task?.outcome_ids) ? task.outcome_ids : [];
          outcomeIds.forEach((oid) => {
            byOutcomeId[oid] = (byOutcomeId[oid] || 0) + 1;
          });
          const domain = task?.primary_life_domain;
          if (domain) byDomain[domain] = (byDomain[domain] || 0) + 1;
        });
        const knownOutcomeRows = desiredOutcomes.map((o) => ({
          id: o.id || o.title,
          name: o.title || o.id || "Outcome",
          count: byOutcomeId[o.id || o.title] || 0,
        }));
        const unknownOutcomeRows = Object.entries(byOutcomeId)
          .filter(([id]) => !knownOutcomeRows.some((r) => String(r.id) === String(id)))
          .map(([id, count]) => ({ id, name: outcomeLabel.get(id) || id, count }));
        setCompletionsByOutcome(
          [...knownOutcomeRows, ...unknownOutcomeRows].sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return String(a.name).localeCompare(String(b.name));
          })
        );
        setCompletionsByLifeDomain(
          Object.entries(byDomain)
            .map(([key, count]) => ({
              name: getHumanNeedStrategyLabel(key),
              count,
            }))
            .sort((a, b) => b.count - a.count)
        );
      } catch (e) {
        setError(e.message || "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, refreshNonce]);

  const categoryChartHeight = Math.max(240, completionsByCategory.length * 42);
  const outcomeChartHeight = Math.max(240, completionsByOutcome.length * 40);
  const lifeDomainChartHeight = Math.max(220, completionsByLifeDomain.length * 38);

  const coachPayload = useMemo(
    () => ({
      days_active_30: summaryMetrics.daysActive30,
      this_week_total: summaryMetrics.thisWeekTotal,
      last_week_total: summaryMetrics.lastWeekTotal,
      weekly_review_streak: summaryMetrics.weeklyReviewStreak,
      active_streak_days: summaryMetrics.activeStreakDays,
      overdue: puttingOff.overdue,
      high_pri_open: puttingOff.highPriorityOpen,
      weekly_trend: weeklyTrend.slice(-8).map((w) => w.count),
      decisive_rhythm: decisiveRhythm.slice(-8).map((w) => w.days),
      top_outcomes: outcomeMomentum.series.slice(0, 3),
      top_projects: projectContribution.series.slice(0, 3),
      by_category_top: completionsByCategory.slice(0, 5).map((r) => ({
        name: r.name,
        count: r.count,
        alignment: r.alignment,
      })),
      by_outcome_top: completionsByOutcome.slice(0, 5).map((r) => ({
        name: r.name,
        count: r.count,
      })),
    }),
    [
      summaryMetrics,
      puttingOff,
      weeklyTrend,
      decisiveRhythm,
      outcomeMomentum,
      projectContribution,
      completionsByCategory,
      completionsByOutcome,
    ]
  );

  return (
    <PSShell
      scope="analytics"
      title="Analytics"
      coachPayload={coachPayload}
      coachPayloadReady={!loading}
    >
      <div className="ps-view an-view">
        <div className="ps-eyebrow">— · Analytics</div>
        <h1 className="ps-title">Signal from the noise.</h1>
        <p className="ps-sub">
          Trends, momentum, and alignment — the numbers that tell you whether
          your next best action is pulling you toward the vision.
        </p>

        {error && <div className="an-error">{error}</div>}

        <div className="an-kpis">
          <KpiTile
            label="Active streak"
            value={`${summaryMetrics.activeStreakDays}d`}
            hint="Days in a row with ≥1 completion"
            accent="var(--ps-accent)"
          />
          <KpiTile
            label="Weekly review streak"
            value={`${summaryMetrics.weeklyReviewStreak}`}
            hint={
              summaryMetrics.weeklyReviewStreak === 1
                ? "consecutive week"
                : "consecutive weeks"
            }
            accent="var(--ps-sage)"
          />
          <KpiTile
            label="This week vs last"
            value={`${summaryMetrics.thisWeekTotal} / ${summaryMetrics.lastWeekTotal}`}
            hint="Task completions"
            accent="var(--ps-indigo)"
            delta={summaryMetrics.thisWeekTotal - summaryMetrics.lastWeekTotal}
          />
          <KpiTile
            label="Days active"
            value={`${summaryMetrics.daysActive30}`}
            hint="Last 30 days"
            accent="var(--ps-plum)"
          />
        </div>

        {(puttingOff.overdue > 0 || puttingOff.highPriorityOpen > 0) && (
          <div className="an-alert">
            <span className="an-alert-cap">What you might be putting off</span>
            <div className="an-alert-row">
              {puttingOff.overdue > 0 && (
                <Link href="/backlog?quick=overdue" className="an-alert-link">
                  <strong>{puttingOff.overdue}</strong> overdue
                </Link>
              )}
              {puttingOff.highPriorityOpen > 0 && (
                <Link href="/backlog?quick=critical_high" className="an-alert-link">
                  <strong>{puttingOff.highPriorityOpen}</strong> open Critical/High
                </Link>
              )}
            </div>
          </div>
        )}

        <section className="an-card">
          <div className="an-card-head">
            <h2>Weekly momentum</h2>
            <span className="an-cap">Completions per week · last 12 weeks</span>
          </div>
          {weeklyTrend.length > 0 ? (
            <MeasuredChart
              height={220}
              renderChart={({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height}
                  data={weeklyTrend}
                  margin={{ top: 10, right: 16, bottom: 6, left: 0 }}
                >
                  <defs>
                    <linearGradient id="grad-momentum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b97316" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#b97316" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ps-paper-soft)",
                      border: "1px solid var(--ps-ink-15)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#b97316"
                    strokeWidth={2}
                    fill="url(#grad-momentum)"
                    name="Completions"
                  />
                </AreaChart>
              )}
            />
          ) : (
            <p className="an-empty">Complete tasks to build a momentum trend.</p>
          )}
        </section>

        <section className="an-card">
          <div className="an-card-head">
            <h2>Decisive-action rhythm</h2>
            <span className="an-cap">
              Days/week with ≥1 Critical or High completion · last 12 weeks
            </span>
          </div>
          {decisiveRhythm.length > 0 ? (
            <MeasuredChart
              height={200}
              renderChart={({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={decisiveRhythm}
                  margin={{ top: 10, right: 16, bottom: 6, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, 7]}
                    tick={{ fontSize: 11, fill: "#655e4f" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ps-paper-soft)",
                      border: "1px solid var(--ps-ink-15)",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="days"
                    fill="#b85c3e"
                    radius={[4, 4, 0, 0]}
                    name="Decisive days"
                  />
                </BarChart>
              )}
            />
          ) : (
            <p className="an-empty">
              Completing a Critical or High task lights up a day. Ship one.
            </p>
          )}
        </section>

        <section className="an-card">
          <div className="an-card-head">
            <h2>Outcome momentum</h2>
            <span className="an-cap">
              Completions per week by outcome · top 5 · last 12 weeks
            </span>
          </div>
          {outcomeMomentum.series.length > 0 ? (
            <MeasuredChart
              height={260}
              renderChart={({ width, height }) => (
                <LineChart
                  width={width}
                  height={height}
                  data={outcomeMomentum.weeks}
                  margin={{ top: 10, right: 16, bottom: 6, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ps-paper-soft)",
                      border: "1px solid var(--ps-ink-15)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {outcomeMomentum.series.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={`var(--ps-${["accent", "indigo", "sage", "plum", "gold"][i % 5]})`}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      name={shortenChartLabel(name, 28)}
                    />
                  ))}
                </LineChart>
              )}
            />
          ) : (
            <p className="an-empty">
              Link tasks to outcomes (Action Items · Outcome column) so effort
              shows up here.
            </p>
          )}
        </section>

        <section className="an-card">
          <div className="an-card-head">
            <h2>Project contribution</h2>
            <span className="an-cap">
              Weekly completions by project · top 5 · last 12 weeks
            </span>
          </div>
          {projectContribution.series.length > 0 ? (
            <MeasuredChart
              height={260}
              renderChart={({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height}
                  data={projectContribution.weeks}
                  margin={{ top: 10, right: 16, bottom: 6, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#655e4f" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ps-paper-soft)",
                      border: "1px solid var(--ps-ink-15)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {projectContribution.series.map((name, i) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stackId="1"
                      stroke={`var(--ps-${["accent", "indigo", "sage", "plum", "gold"][i % 5]})`}
                      fill={`var(--ps-${["accent", "indigo", "sage", "plum", "gold"][i % 5]}-soft)`}
                      name={shortenChartLabel(name, 28)}
                    />
                  ))}
                </AreaChart>
              )}
            />
          ) : (
            <p className="an-empty">
              Portfolio trend will fill in as projects produce completions.
            </p>
          )}
        </section>

        <section className="an-card">
          <div className="an-card-head">
            <h2>Six human needs — drift</h2>
            <span className="an-cap">Self-scores from the two previous weekly reviews (1–10)</span>
          </div>
          {humanNeedsRadarData.some((d) => d.older > 0 || d.newer > 0) ? (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="72%"
                  data={humanNeedsRadarData}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                  <PolarGrid stroke="rgba(26,24,20,0.12)" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 12, fill: "#655e4f" }}
                    tickLine={false}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 10]}
                    tick={{ fontSize: 10, fill: "#a39a89" }}
                    tickCount={6}
                  />
                  <Radar
                    name={
                      humanNeedsWeekLabels.older
                        ? `Week of ${formatWeekLabel(humanNeedsWeekLabels.older)}`
                        : "2 weeks ago"
                    }
                    dataKey="older"
                    stroke="#8a7a60"
                    fill="#c4b5a0"
                    fillOpacity={0.35}
                    strokeWidth={1.5}
                  />
                  <Radar
                    name={
                      humanNeedsWeekLabels.newer
                        ? `Week of ${formatWeekLabel(humanNeedsWeekLabels.newer)}`
                        : "Last week"
                    }
                    dataKey="newer"
                    stroke="#b97316"
                    fill="#b97316"
                    fillOpacity={0.28}
                    strokeWidth={2}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => <span style={{ color: "#3d362a" }}>{value}</span>}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="an-empty">
              Complete at least one weekly review with needs scores to see
              drift here.
            </p>
          )}
        </section>

        <div className="an-grid">
          <section className="an-card">
            <div className="an-card-head">
              <h2>Project completions</h2>
              <span className="an-cap">Last 30 days · alignment on right</span>
            </div>
            {completionsByCategory.length > 0 ? (
              <MeasuredChart
                height={categoryChartHeight}
                renderChart={({ width, height }) => (
                  <BarChart
                    width={width}
                    height={height}
                    data={completionsByCategory}
                    layout="vertical"
                    margin={{ top: 8, right: 48, bottom: 8, left: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={112}
                      interval={0}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => shortenChartLabel(value, 22)}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#4a6b8f" radius={[0, 4, 4, 0]} name="Completions">
                      <LabelList
                        dataKey="alignment_label"
                        position="right"
                        offset={10}
                        fill="#4a6b8f"
                        fontSize={11}
                        formatter={(value) => (value ? `${value}` : "")}
                      />
                    </Bar>
                  </BarChart>
                )}
              />
            ) : (
              <p className="an-empty">No project completions yet.</p>
            )}
          </section>

          <section className="an-card">
            <div className="an-card-head">
              <h2>By outcome</h2>
              <span className="an-cap">Last 30 days</span>
            </div>
            {completionsByOutcome.length > 0 ? (
              <MeasuredChart
                height={outcomeChartHeight}
                renderChart={({ width, height }) => (
                  <BarChart
                    width={width}
                    height={height}
                    data={completionsByOutcome}
                    layout="vertical"
                    margin={{ top: 8, right: 20, bottom: 8, left: 140 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={132}
                      interval={0}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => shortenChartLabel(value, 28)}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#b97316" radius={[0, 4, 4, 0]} name="Completions" />
                  </BarChart>
                )}
              />
            ) : (
              <p className="an-empty">
                Link tasks to outcomes on Action Items to see distribution.
              </p>
            )}
          </section>

          <section className="an-card">
            <div className="an-card-head">
              <h2>Human need spread</h2>
              <span className="an-cap">Where your effort landed · last 30 days</span>
            </div>
            {completionsByLifeDomain.length > 0 ? (
              <MeasuredChart
                height={lifeDomainChartHeight}
                renderChart={({ width, height }) => (
                  <BarChart
                    width={width}
                    height={height}
                    data={completionsByLifeDomain}
                    layout="vertical"
                    margin={{ top: 8, right: 20, bottom: 8, left: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={112}
                      interval={0}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => shortenChartLabel(value, 24)}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6b8f71" radius={[0, 4, 4, 0]} name="Completions" />
                  </BarChart>
                )}
              />
            ) : (
              <p className="an-empty">
                Tag tasks with a human need on Action Items to see the spread.
              </p>
            )}
          </section>

          <section className="an-card">
            <div className="an-card-head">
              <h2>Time of day</h2>
              <span className="an-cap">When you ship · last 30 days</span>
            </div>
            <MeasuredChart
              height={220}
              renderChart={({ width, height }) => (
                <BarChart width={width} height={height} data={hourHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,24,20,0.06)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8a5a7a" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            />
          </section>
        </div>

        <section className="an-card">
          <div className="an-card-head">
            <h2>Coach refinement</h2>
            <span className="an-cap">How often you take AI suggestions</span>
          </div>
          <div className="an-chips">
            <span className="an-chip an-chip--ok">
              Accepted <strong>{plannerRefinementMetrics.accepted}</strong>
            </span>
            <span className="an-chip an-chip--gold">
              Applied <strong>{plannerRefinementMetrics.applied}</strong>
            </span>
            <span className="an-chip">
              Dismissed <strong>{plannerRefinementMetrics.dismissed}</strong>
            </span>
            {improvementLabReport && (
              <>
                <span className="an-chip an-chip--gold">
                  Lab runs <strong>{improvementLabReport.total_runs}</strong>
                </span>
                <span className="an-chip an-chip--ok">
                  Acceptance <strong>{improvementLabReport.acceptance_rate}%</strong>
                </span>
                <span className="an-chip">
                  Application <strong>{improvementLabReport.application_rate}%</strong>
                </span>
              </>
            )}
          </div>
        </section>

        <section className="an-card">
          <div className="an-card-head">
            <h2>Recent completions</h2>
            <span className="an-cap">Last 50</span>
          </div>
          {lastCompleted.length === 0 ? (
            <p className="an-empty">No completions yet.</p>
          ) : (
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {lastCompleted.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.task?.title ?? ev.task_id}</td>
                      <td className="an-muted">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {loading && <p className="an-muted" style={{ marginTop: 14 }}>Loading…</p>}
      </div>

      <style jsx global>{`
        .an-view {
          padding-bottom: 40px;
        }
        .an-error {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(184, 92, 62, 0.08);
          border: 1px solid rgba(184, 92, 62, 0.25);
          color: var(--ps-clay);
          font-size: 13px;
        }
        .an-kpis {
          margin-top: 20px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .an-kpi {
          padding: 14px 16px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          position: relative;
          overflow: hidden;
        }
        .an-kpi::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: var(--ps-ink-30);
        }
        .an-kpi-lab {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .an-kpi-val {
          font-family: var(--ps-serif);
          font-size: 28px;
          letter-spacing: -0.02em;
          color: var(--ps-ink);
          margin-top: 4px;
          line-height: 1.1;
        }
        .an-kpi-hint {
          margin-top: 2px;
          font-size: 11px;
          color: var(--ps-ink-60);
        }
        .an-kpi-delta {
          margin-left: 6px;
          font-size: 12px;
          font-family: var(--ps-mono);
        }
        .an-kpi-delta--up { color: var(--ps-sage); }
        .an-kpi-delta--down { color: var(--ps-clay); }
        .an-alert {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--ps-clay-soft);
          border: 1px solid rgba(184, 92, 62, 0.25);
        }
        .an-alert-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-clay);
        }
        .an-alert-row {
          display: flex;
          gap: 14px;
          margin-top: 6px;
          flex-wrap: wrap;
          font-size: 13px;
        }
        .an-alert-link {
          color: var(--ps-clay);
          text-decoration: underline;
        }
        .an-card {
          margin-top: 18px;
          padding: 18px 20px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
        }
        .an-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .an-card-head h2 {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
          margin: 0;
        }
        .an-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .an-empty {
          margin: 0;
          font-size: 13px;
          color: var(--ps-ink-60);
        }
        .an-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }
        .an-grid .an-card {
          margin-top: 0;
        }
        @media (max-width: 900px) {
          .an-grid { grid-template-columns: 1fr; }
        }
        .an-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .an-chip {
          padding: 6px 12px;
          border-radius: 999px;
          background: var(--ps-ink-05);
          color: var(--ps-ink-70);
          font-size: 12px;
          font-family: var(--ps-mono);
        }
        .an-chip strong {
          color: var(--ps-ink);
          margin-left: 4px;
        }
        .an-chip--ok {
          background: var(--ps-sage-soft);
          color: var(--ps-sage);
        }
        .an-chip--ok strong { color: var(--ps-sage); }
        .an-chip--gold {
          background: var(--ps-gold-soft);
          color: var(--ps-gold);
        }
        .an-chip--gold strong { color: var(--ps-gold); }
        .an-table-wrap {
          overflow-x: auto;
        }
        .an-table {
          width: 100%;
          font-size: 13px;
          border-collapse: collapse;
        }
        .an-table thead tr {
          color: var(--ps-ink-60);
          border-bottom: 1px solid var(--ps-ink-10);
        }
        .an-table th {
          text-align: left;
          padding: 8px 8px 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .an-table tbody tr {
          border-bottom: 1px solid var(--ps-ink-05);
        }
        .an-table td {
          padding: 7px 8px;
          color: var(--ps-ink-80);
        }
        .an-muted {
          color: var(--ps-ink-50);
        }
      `}</style>
    </PSShell>
  );
}

function KpiTile({ label, value, hint, accent, delta }) {
  const showDelta = typeof delta === "number" && !Number.isNaN(delta);
  return (
    <div className="an-kpi" style={{ "--kpi-accent": accent || "var(--ps-ink-30)" }}>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent || "var(--ps-ink-30)",
        }}
      />
      <div className="an-kpi-lab">{label}</div>
      <div className="an-kpi-val">
        {value}
        {showDelta && delta !== 0 && (
          <span
            className={
              "an-kpi-delta " + (delta > 0 ? "an-kpi-delta--up" : "an-kpi-delta--down")
            }
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      <div className="an-kpi-hint">{hint}</div>
    </div>
  );
}
