import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import {
  getCompletedEventsInRange,
  getLastCompletedEventsWithTasks,
  getWeeklyReviewWeeks,
  getPlannerRefinementEventsInRange,
  getWeeklyReview,
  getDailyTemplateTaskIds,
  getBacklogTasks,
  getCategoriesWithSubcategories,
  getUserProfile,
  listWeeklyImprovementRuns,
} from "../lib/db";
import {
  BarChart,
  Bar,
  LabelList,
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
import { computeProjectAlignment, mergeProjectWorkspace } from "../lib/projectWorkspace";
import { buildImprovementLabReport } from "../lib/weeklyImprovementContext";

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

function shortenChartLabel(value, max = 26) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
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
  const [completionsByOutcome, setCompletionsByOutcome] = useState([]);
  const [completionsByLifeDomain, setCompletionsByLifeDomain] = useState([]);
  const [improvementLabReport, setImprovementLabReport] = useState(null);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError("");
      const today = new Date();
      const start7 = addDays(today, -7);
      const start30 = addDays(today, -30);

      try {
        const [range7, range30, last, weeks, plannerRefinements, dailyTaskIdsRes, backlogOpen, backlogAll, categoriesRes, profileRes, improvementRunsRes] = await Promise.all([
          getCompletedEventsInRange(user.id, dateStrLocal(start7), dateStrLocal(today)),
          getCompletedEventsInRange(user.id, dateStrLocal(start30), dateStrLocal(today)),
          getLastCompletedEventsWithTasks(user.id, 50),
          getWeeklyReviewWeeks(user.id, 52),
          getPlannerRefinementEventsInRange(user.id, dateStr(start30), dateStr(today)),
          getDailyTemplateTaskIds(user.id),
          getBacklogTasks(user.id, { includeArchived: false }),
          getBacklogTasks(user.id, { includeArchived: true }),
          getCategoriesWithSubcategories(user.id),
          getUserProfile(user.id),
          listWeeklyImprovementRuns(user.id, 12),
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

        if (!improvementRunsRes.error) {
          setImprovementLabReport(buildImprovementLabReport(improvementRunsRes.data || []));
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

        const openTodoDoing = openTasks.filter((t) => t.status === "todo" || t.status === "doing");
        const overdue = openTodoDoing.filter((t) => t.due_date && dateStrLocal(new Date(t.due_date)) < todayStr).length;
        const highPriorityOpen = openTodoDoing.filter((t) => (t.priority === "Critical" || t.priority === "High")).length;
        setPuttingOff({ overdue, highPriorityOpen });

        const categoryCounts = {};
        const projectAlignmentByCategory = {};
        const prefs = profileRes?.data?.profile?.preferences || {};
        const allCategories = (categoriesRes?.data || []).map((category) => ({
          id: category.id,
          name: (category?.name || "Uncategorized").trim() || "Uncategorized",
        }));
        allCategories.forEach((category) => {
          const catTasks = (allTasks || []).filter((task) => String(task.category_id) === String(category.id));
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
        const byCategory = allCategories
          .filter((category) => category.name.toLowerCase() !== "daily repeat")
          .map((category) => ({
            name: category.name,
            count: categoryCounts[category.name] || 0,
            alignment: projectAlignmentByCategory[category.name] ?? null,
            alignment_label:
              typeof projectAlignmentByCategory[category.name] === "number"
                ? `${projectAlignmentByCategory[category.name]}`
                : "",
          }))
          .concat(
            Object.entries(categoryCounts)
              .filter(([name]) => !allCategories.some((category) => category.name === name))
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

        const profile = profileRes?.data?.profile || {};
        const desiredOutcomes = profile.desired_outcomes || [];
        const outcomesById = new Map(desiredOutcomes.map((o) => [o.id || o.title, o.title || o.id]));
        const lifeDomains = profile.life_domains || {};
        const byOutcomeId = {};
        const byDomain = {};
        (range30.data || []).forEach((ev) => {
          const task = tasksById.get(ev.task_id);
          const outcomeIds = Array.isArray(task?.outcome_ids) ? task.outcome_ids : [];
          if (outcomeIds.length > 0) {
            outcomeIds.forEach((oid) => {
              byOutcomeId[oid] = (byOutcomeId[oid] || 0) + 1;
            });
          }
          const domain = task?.primary_life_domain;
          if (domain) {
            byDomain[domain] = (byDomain[domain] || 0) + 1;
          }
        });
        const knownOutcomeRows = desiredOutcomes.map((outcome) => ({
          id: outcome.id || outcome.title,
          name: outcome.title || outcome.id || "Outcome",
          count: byOutcomeId[outcome.id || outcome.title] || 0,
        }));
        const unknownOutcomeRows = Object.entries(byOutcomeId)
          .filter(([id]) => !knownOutcomeRows.some((row) => String(row.id) === String(id)))
          .map(([id, count]) => ({ id, name: outcomesById.get(id) || id, count }));
        setCompletionsByOutcome(
          [...knownOutcomeRows, ...unknownOutcomeRows].sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return String(a.name).localeCompare(String(b.name));
          })
        );
        setCompletionsByLifeDomain(
          Object.entries(byDomain)
            .map(([key, count]) => ({
              name: (lifeDomains[key] && String(lifeDomains[key]).slice(0, 30)) || key,
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
  }, [user]);

  if (loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
      </DashboardLayout>
    );
  }

  const categoryChartHeight = Math.max(280, completionsByCategory.length * 46);
  const outcomeChartHeight = Math.max(280, completionsByOutcome.length * 42);
  const lifeDomainChartHeight = Math.max(260, completionsByLifeDomain.length * 40);

  return (
    <DashboardLayout>
      <div>
        <PageHeader
          eyebrow="Your momentum"
          title="Analytics & rhythm"
          subtitle={
            weeklyStreak > 0
              ? `Completion patterns, time-of-day, and reviews. Weekly review streak: ${weeklyStreak} week${weeklyStreak === 1 ? "" : "s"}.`
              : "Quantifying the vision. Tracking the spirit — completions, time-of-day, and reviews."
          }
        />

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>
        )}

        <div className="rs-stat-grid" style={{ marginTop: 8 }}>
          <div className="rs-stat-tile">
            <div className="rs-stat-tile__label">Days active</div>
            <div className="rs-stat-tile__value">{summaryMetrics.daysActive7}</div>
            <div className="rs-stat-tile__hint">Last 7 days</div>
          </div>
          <div className="rs-stat-tile">
            <div className="rs-stat-tile__label">Days active</div>
            <div className="rs-stat-tile__value">{summaryMetrics.daysActive30}</div>
            <div className="rs-stat-tile__hint">Last 30 days</div>
          </div>
          <div className="rs-stat-tile rs-stat-tile--gold">
            <div className="rs-stat-tile__label">This week vs last</div>
            <div className="rs-stat-tile__value" style={{ fontSize: "1.35rem" }}>
              {summaryMetrics.thisWeekTotal} / {summaryMetrics.lastWeekTotal}
            </div>
            <div className="rs-stat-tile__hint">Task completions</div>
          </div>
          {summaryMetrics.dailyHitsRate7 != null && (
            <div className="rs-stat-tile">
              <div className="rs-stat-tile__label">Daily hits</div>
              <div className="rs-stat-tile__value">{summaryMetrics.dailyHitsRate7}%</div>
              <div className="rs-stat-tile__hint">7-day ritual rate</div>
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
                <Link
                  href="/backlog?quick=overdue"
                  style={{ color: "#b91c1c", textDecoration: "underline" }}
                >
                  <strong>{puttingOff.overdue}</strong> overdue task{puttingOff.overdue === 1 ? "" : "s"}
                </Link>
              )}
              {puttingOff.highPriorityOpen > 0 && (
                <Link
                  href="/backlog?quick=critical_high"
                  style={{ color: "#b91c1c", textDecoration: "underline" }}
                >
                  <strong>{puttingOff.highPriorityOpen}</strong> open Critical/High priority
                </Link>
              )}
            </div>
          </div>
        )}

        <style>{`
          .analytics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 20px; }
          @media (max-width: 768px) { .analytics-grid { grid-template-columns: 1fr; } }
        `}</style>
        <div className="analytics-grid">
        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ marginBottom: 4 }}>
            Six human needs — change over time
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
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
                  <PolarGrid stroke="rgba(186, 177, 159, 0.35)" strokeOpacity={0.9} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 12, fill: "#655e4f" }}
                    tickLine={false}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 10]}
                    tick={{ fontSize: 10, fill: "#9a9285" }}
                    tickCount={6}
                  />
                  <Radar
                    name={humanNeedsWeekLabels.older ? `Week of ${formatWeekLabel(humanNeedsWeekLabels.older)}` : "2 weeks ago"}
                    dataKey="older"
                    stroke="#a89880"
                    fill="#c4b5a0"
                    fillOpacity={0.4}
                    strokeWidth={1.5}
                  />
                  <Radar
                    name={humanNeedsWeekLabels.newer ? `Week of ${formatWeekLabel(humanNeedsWeekLabels.newer)}` : "Last week"}
                    dataKey="newer"
                    stroke="#8a7020"
                    fill="#d4af37"
                    fillOpacity={0.5}
                    strokeWidth={2}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => <span style={{ color: "#37322a" }}>{value}</span>}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
              Complete at least one weekly review (with needs scores) to see your chart here.
            </p>
          )}
        </section>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>
            Planner refinement (30 days)
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "var(--rs-radius-md)",
                background: "rgba(85, 93, 30, 0.1)",
                color: "var(--rs-olive)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Accepted: <strong>{plannerRefinementMetrics.accepted}</strong>
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "var(--rs-radius-md)",
                background: "rgba(245, 206, 83, 0.2)",
                color: "var(--rs-primary-strong)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Applied: <strong>{plannerRefinementMetrics.applied}</strong>
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "var(--rs-radius-md)",
                background: "var(--rs-surface-low)",
                color: "var(--rs-on-surface-variant)",
                fontSize: 13,
              }}
            >
              Dismissed: <strong>{plannerRefinementMetrics.dismissed}</strong>
            </div>
          </div>
        </section>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>
            Recursive improvement lab
          </h2>
          {improvementLabReport ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ padding: "8px 12px", borderRadius: "var(--rs-radius-md)", background: "rgba(212, 175, 55, 0.16)", color: "var(--rs-primary-strong)", fontSize: 13, fontWeight: 600 }}>
                  Runs: <strong>{improvementLabReport.total_runs}</strong>
                </div>
                <div style={{ padding: "8px 12px", borderRadius: "var(--rs-radius-md)", background: "rgba(85, 93, 30, 0.1)", color: "var(--rs-olive)", fontSize: 13, fontWeight: 600 }}>
                  Acceptance: <strong>{improvementLabReport.acceptance_rate}%</strong>
                </div>
                <div style={{ padding: "8px 12px", borderRadius: "var(--rs-radius-md)", background: "var(--rs-surface-low)", color: "var(--rs-on-surface-variant)", fontSize: 13, fontWeight: 600 }}>
                  Application: <strong>{improvementLabReport.application_rate}%</strong>
                </div>
              </div>
              {improvementLabReport.by_prompt_version?.length > 0 && (
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--rs-on-surface-variant)" }}>
                  Prompt versions:{" "}
                  {improvementLabReport.by_prompt_version.map((row) => `${row.key} (${row.count})`).join(" · ")}
                </p>
              )}
              {improvementLabReport.by_model?.length > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--rs-on-surface-variant)" }}>
                  Models: {improvementLabReport.by_model.map((row) => `${row.key} (${row.count})`).join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
              Generate a weekly improvement coach run to start measuring acceptance and application quality.
            </p>
          )}
        </section>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 4 }}>
            7-day momentum
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 8, fontSize: 12 }}>
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
                <Bar dataKey="daily" name="Daily tasks" stackId="a" fill="#555d1e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" name="Other tasks" stackId="a" fill="#d4af37" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          />
        </section>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 4 }}>
            30-day momentum
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 8, fontSize: 12 }}>
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
                <Bar dataKey="daily" name="Daily tasks" stackId="a" fill="#555d1e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" name="Other tasks" stackId="a" fill="#d4af37" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          />
        </section>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>
            Completion time of day
          </h2>
          <MeasuredChart
            renderChart={({ width, height }) => (
              <BarChart width={width} height={height} data={hourHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6b5500" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          />
        </section>

        <section className="rs-section-card">
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 4 }}>
            Progress by category (30 days)
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 8, fontSize: 12 }}>
            Where your completions landed. Numbers at the right edge show each project's alignment score.
          </p>
          {completionsByCategory.length > 0 ? (
            <MeasuredChart
              height={categoryChartHeight}
              renderChart={({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={completionsByCategory}
                  layout="vertical"
                  margin={{ top: 8, right: 42, bottom: 8, left: 120 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={112}
                    interval={0}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => shortenChartLabel(value, 22)}
                  />
                  <Tooltip
                    formatter={(value, name, payload) => {
                      if (name === "Alignment") return [`${value}`, name];
                      return [value, name];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="count" fill="#555d1e" radius={[0, 4, 4, 0]} name="Completions">
                    <LabelList
                      dataKey="alignment_label"
                      position="right"
                      offset={10}
                      fill="#555d1e"
                      fontSize={12}
                      formatter={(value) => (value ? `${value}` : "")}
                    />
                  </Bar>
                </BarChart>
              )}
            />
          ) : (
            <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
              Complete tasks to see breakdown by category.
            </p>
          )}
        </section>

        <section
          className="rs-section-card"
          style={{
            background: "linear-gradient(180deg, rgba(212, 175, 55, 0.08) 0%, var(--rs-surface-raised) 100%)",
            borderColor: "rgba(212, 175, 55, 0.22)",
          }}
        >
          <h2
            className="rs-section-card__title"
            style={{ fontSize: "1rem", marginBottom: 4, color: "var(--rs-primary-strong)" }}
          >
            Completions by outcome (30 days)
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 8, fontSize: 12 }}>
            Tasks linked to your Vision outcomes — assign on Action Items or use AI Enrich.
          </p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(186, 177, 159, 0.25)" />
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
                  <Bar dataKey="count" fill="#b8860b" radius={[0, 4, 4, 0]} name="Completions" />
                </BarChart>
              )}
            />
          ) : (
            <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
              Link tasks to outcomes on the Action Items page (Outcome column) or run Apply enrichment to see distribution here.
            </p>
          )}
        </section>

        <section
          className="rs-section-card"
          style={{
            background: "linear-gradient(180deg, var(--rs-surface-low) 0%, var(--rs-surface-raised) 100%)",
          }}
        >
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 4 }}>
            Completions by life domain (30 days)
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 8, fontSize: 12 }}>
            Effort by life domain — set Domain on Action Items or via AI Enrich.
          </p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(186, 177, 159, 0.25)" />
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
                  <Bar dataKey="count" fill="#7f5c53" radius={[0, 4, 4, 0]} name="Completions" />
                </BarChart>
              )}
            />
          ) : (
            <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
              Set Life domain on Action Items or run Apply enrichment to see effort by domain.
            </p>
          )}
        </section>

        <section className="rs-section-card" style={{ gridColumn: "1 / -1" }}>
          <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>
            Completed tasks with timestamps (last 50)
          </h2>
          {lastCompleted.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
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
