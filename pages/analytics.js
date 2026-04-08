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
  getTemplates,
  getTemplateItems,
  getBacklogTasks,
  getCategoriesWithSubcategories,
  getUserProfile,
  listWeeklyImprovementRuns,
  setTaskCompletionForDate,
} from "../lib/db";
import {
  BarChart,
  Bar,
  LabelList,
  LineChart,
  Line,
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

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
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

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function buildDateRange(startDate, endDate) {
  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(dateStrLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildCurrentStreak(completionSet, todayKey) {
  let streak = 0;
  let cursor = new Date(`${todayKey}T12:00:00`);
  while (completionSet.has(dateStrLocal(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function buildBestStreak(completionSet, orderedDates) {
  let best = 0;
  let current = 0;
  orderedDates.forEach((day) => {
    if (completionSet.has(day)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  });
  return best;
}

function progressRing(progress, label, valueLabel, accent) {
  const pct = clampPercent(progress);
  return {
    label,
    valueLabel,
    progress: pct,
    accent,
    gradient: `conic-gradient(${accent} 0 ${pct}%, rgba(255,255,255,0.1) ${pct}% 100%)`,
  };
}

function getDefaultTemplate(items) {
  const templates = Array.isArray(items) ? items : [];
  return templates.find((item) => item.is_default) || templates[0] || null;
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
  const [habitTracker, setHabitTracker] = useState(null);
  const [habitEditKey, setHabitEditKey] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    function handleWindowFocus() {
      setRefreshNonce((value) => value + 1);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setRefreshNonce((value) => value + 1);
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
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const habitHistoryStart = addDays(today, -120);

      try {
        const [
          range7,
          range30,
          habitHistoryRes,
          last,
          weeks,
          plannerRefinements,
          dailyTaskIdsRes,
          templatesRes,
          backlogOpen,
          backlogAll,
          categoriesRes,
          profileRes,
          improvementRunsRes,
        ] = await Promise.all([
          getCompletedEventsInRange(user.id, dateStrLocal(start7), dateStrLocal(today)),
          getCompletedEventsInRange(user.id, dateStrLocal(start30), dateStrLocal(today)),
          getCompletedEventsInRange(user.id, dateStrLocal(habitHistoryStart), dateStrLocal(today)),
          getLastCompletedEventsWithTasks(user.id, 50),
          getWeeklyReviewWeeks(user.id, 52),
          getPlannerRefinementEventsInRange(user.id, dateStr(start30), dateStr(today)),
          getDailyTemplateTaskIds(user.id),
          getTemplates(),
          getBacklogTasks(user.id, { includeArchived: false }),
          getBacklogTasks(user.id, { includeArchived: true }),
          getCategoriesWithSubcategories(user.id),
          getUserProfile(user.id),
          listWeeklyImprovementRuns(user.id, 12),
        ]);

        const dailyTemplateTaskIds = dailyTaskIdsRes.data || new Set();
        const defaultTemplate = getDefaultTemplate(templatesRes?.data || []);
        const templateItemsRes = defaultTemplate ? await getTemplateItems(defaultTemplate.id) : { data: [], error: null };
        if (templateItemsRes.error) setError(templateItemsRes.error.message);
        const orderedTemplateItems = templateItemsRes.data || [];
        const todayStr = dateStrLocal(today);
        const openTasks = backlogOpen.data || [];
        const allTasks = backlogAll.data || [];
        const tasksById = new Map((allTasks || []).map((t) => [t.id, t]));

        if (range7.error) setError(range7.error.message);
        if (range30.error) setError(range30.error.message);

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
        const orderedTemplateTasks = orderedTemplateItems
          .map((item) => item?.task)
          .filter((task) => task?.id);
        const orderedTemplateTaskIds = orderedTemplateTasks.map((task) => String(task.id));
        const habitTaskIdSet = new Set(
          orderedTemplateTaskIds.length > 0
            ? orderedTemplateTaskIds
            : Array.from(dailyTemplateTaskIds).map((taskId) => String(taskId))
        );
        const dailySize = habitTaskIdSet.size || 1;
        const totalDailyIn7 = (range7.data || []).filter((ev) => habitTaskIdSet.has(String(ev.task_id))).length;
        const maxDailyPossible = dailySize * 7;
        setSummaryMetrics({
          daysActive7: datesWithCompletions7.size,
          daysActive30: datesWithCompletions30.size,
          thisWeekTotal: totalThisWeek,
          lastWeekTotal,
          dailyHitsRate7: maxDailyPossible > 0 ? Math.round((totalDailyIn7 / maxDailyPossible) * 100) : null,
        });

        const todayKey = dateStrLocal(today);
        const monthDays = buildDateRange(monthStart, monthEnd);
        const visibleMonthDays = monthDays.filter((day) => day <= todayKey);
        const habitHistoryEvents = habitHistoryRes.data || [];
        const habitTasks = orderedTemplateTaskIds.length > 0
          ? orderedTemplateTaskIds.map((taskId) => tasksById.get(taskId)).filter(Boolean)
          : Array.from(dailyTemplateTaskIds)
              .map((taskId) => tasksById.get(taskId))
              .filter(Boolean)
              .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
        const habitCompletionsByTask = new Map();
        habitTasks.forEach((task) => {
          habitCompletionsByTask.set(String(task.id), new Set());
        });
        habitHistoryEvents.forEach((event) => {
          const taskId = String(event.task_id || "");
          const bucket = habitCompletionsByTask.get(taskId);
          if (!bucket) return;
          bucket.add(dateStrLocal(new Date(event.created_at)));
        });

        const trendData = visibleMonthDays.map((day) => {
          let completed = 0;
          habitCompletionsByTask.forEach((completionSet) => {
            if (completionSet.has(day)) completed += 1;
          });
          const total = habitTasks.length || 1;
          return {
            day,
            label: String(new Date(`${day}T12:00:00`).getDate()),
            completed,
            remaining: Math.max(total - completed, 0),
            rate: clampPercent((completed / total) * 100),
          };
        });

        const habitRows = habitTasks.map((task) => {
          const completionSet = habitCompletionsByTask.get(String(task.id)) || new Set();
          const completedThisMonth = visibleMonthDays.filter((day) => completionSet.has(day)).length;
          const currentStreak = buildCurrentStreak(completionSet, todayKey);
          const bestStreak = buildBestStreak(completionSet, buildDateRange(habitHistoryStart, today));
          return {
            id: task.id,
            title: task.title || "Untitled habit",
            dates: completionSet,
            monthCompleted: completedThisMonth,
            monthRate: visibleMonthDays.length > 0 ? clampPercent((completedThisMonth / visibleMonthDays.length) * 100) : 0,
            currentStreak,
            bestStreak,
            todayDone: completionSet.has(todayKey),
          };
        });

        const totalHabitGoalsMonth = habitTasks.length * Math.max(visibleMonthDays.length, 1);
        const totalCompletedMonth = habitRows.reduce((sum, row) => sum + row.monthCompleted, 0);
        const todayCompletedHabits = habitRows.filter((row) => row.todayDone).length;
        const sevenDayHabitCompletions = habitRows.reduce((sum, row) => {
          const recentDays = buildDateRange(addDays(today, -6), today);
          return sum + recentDays.filter((day) => row.dates.has(day)).length;
        }, 0);
        const fourteenDayTrend = trendData.slice(-14);
        const momentumRate = fourteenDayTrend.length > 0
          ? clampPercent(
              (fourteenDayTrend.reduce((sum, row) => sum + row.completed, 0) /
                (Math.max(habitTasks.length, 1) * fourteenDayTrend.length)) *
                100
            )
          : 0;

        setHabitTracker({
          monthLabel: today.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          templateName: defaultTemplate?.name || "Daily Hits",
          totalHabits: habitTasks.length,
          monthDays,
          visibleMonthDays,
          trendData,
          habitRows,
          topHabits: [...habitRows]
            .sort((a, b) => {
              if (b.monthCompleted !== a.monthCompleted) return b.monthCompleted - a.monthCompleted;
              return String(a.title).localeCompare(String(b.title));
            })
            .slice(0, 6),
          activeStreaks: [...habitRows]
            .filter((row) => row.currentStreak > 0)
            .sort((a, b) => {
              if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
              return b.monthCompleted - a.monthCompleted;
            })
            .slice(0, 6),
          progressRings: [
            progressRing(momentumRate, "Momentum", `${momentumRate}%`, "#2ec5ff"),
            progressRing(
              habitTasks.length > 0 ? (todayCompletedHabits / habitTasks.length) * 100 : 0,
              "Daily progress",
              `${todayCompletedHabits}/${habitTasks.length || 0}`,
              "#20d97a"
            ),
            progressRing(
              habitTasks.length > 0 ? (sevenDayHabitCompletions / (habitTasks.length * 7 || 1)) * 100 : 0,
              "Weekly progress",
              `${clampPercent((sevenDayHabitCompletions / (habitTasks.length * 7 || 1)) * 100)}%`,
              "#27e58d"
            ),
            progressRing(
              totalHabitGoalsMonth > 0 ? (totalCompletedMonth / totalHabitGoalsMonth) * 100 : 0,
              "Monthly progress",
              `${clampPercent((totalCompletedMonth / totalHabitGoalsMonth) * 100)}%`,
              "#96f060"
            ),
          ],
          stats: {
            startDate: visibleMonthDays[0] || todayKey,
            endDate: visibleMonthDays[visibleMonthDays.length - 1] || todayKey,
            daysElapsed: visibleMonthDays.length,
            goalsThisMonth: totalHabitGoalsMonth,
            completedThisMonth: totalCompletedMonth,
            remainingThisMonth: Math.max(totalHabitGoalsMonth - totalCompletedMonth, 0),
            todayCompleted: todayCompletedHabits,
          },
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
  const hasHabitTracker = habitTracker && habitTracker.totalHabits > 0;

  async function handleHabitDateToggle(taskId, day, isCompleted) {
    if (!user || !taskId || !day) return;
    const todayKey = dateStrLocal(new Date());
    if (day > todayKey) return;
    const editKey = `${taskId}:${day}`;
    setHabitEditKey(editKey);
    try {
      const res = await setTaskCompletionForDate(user.id, taskId, day, !isCompleted);
      if (res.error) {
        setError(res.error.message || "Failed to update habit history.");
        return;
      }
      setRefreshNonce((value) => value + 1);
    } finally {
      setHabitEditKey("");
    }
  }

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
          .analytics-habit-shell {
            margin-top: 20px;
            padding: 18px;
            border-radius: 22px;
            background: linear-gradient(180deg, #0d2032 0%, #081a2b 100%);
            color: #f3f8ff;
            border: 1px solid rgba(98, 139, 182, 0.22);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
          }
          .analytics-habit-header {
            display: grid;
            grid-template-columns: minmax(180px, 1.15fr) minmax(0, 3fr) minmax(200px, 1.15fr);
            gap: 14px;
            align-items: stretch;
          }
          .analytics-habit-titleCard,
          .analytics-habit-sideCard,
          .analytics-habit-panel {
            background: rgba(8, 20, 33, 0.74);
            border: 1px solid rgba(110, 148, 189, 0.18);
            border-radius: 16px;
          }
          .analytics-habit-titleCard {
            padding: 18px;
          }
          .analytics-habit-titleCard h2 {
            margin: 0 0 6px;
            font-size: 1.9rem;
            letter-spacing: -0.03em;
          }
          .analytics-habit-titleCard p {
            margin: 0;
            color: rgba(226, 237, 255, 0.74);
            font-size: 12px;
          }
          .analytics-habit-ringRow {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
          }
          .analytics-habit-ringCard {
            padding: 14px 10px 12px;
            text-align: center;
          }
          .analytics-habit-ring {
            width: 76px;
            height: 76px;
            border-radius: 999px;
            margin: 0 auto 8px;
            display: grid;
            place-items: center;
          }
          .analytics-habit-ringInner {
            width: 58px;
            height: 58px;
            border-radius: 999px;
            background: #0b1d2e;
            display: grid;
            place-items: center;
            font-size: 12px;
            font-weight: 700;
          }
          .analytics-habit-ringLabel {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(220, 233, 255, 0.72);
          }
          .analytics-habit-sideCard {
            padding: 14px;
          }
          .analytics-habit-sideTitle {
            margin: 0 0 10px;
            font-size: 12px;
            color: rgba(220, 233, 255, 0.82);
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .analytics-habit-bars {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .analytics-habit-barRow {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 36px;
            gap: 10px;
            align-items: center;
          }
          .analytics-habit-barMeta {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            font-size: 11px;
            margin-bottom: 3px;
            color: rgba(228, 238, 255, 0.86);
          }
          .analytics-habit-barTrack {
            height: 10px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255,255,255,0.08);
          }
          .analytics-habit-barFill {
            height: 100%;
            border-radius: 999px;
          }
          .analytics-habit-barValue {
            text-align: right;
            font-size: 11px;
            color: rgba(220, 233, 255, 0.78);
          }
          .analytics-habit-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 240px;
            gap: 14px;
            margin-top: 14px;
          }
          .analytics-habit-panel {
            padding: 16px;
          }
          .analytics-habit-metrics {
            display: grid;
            grid-template-columns: 160px minmax(160px, 1fr);
            gap: 14px;
            margin-bottom: 14px;
          }
          .analytics-habit-metricStack {
            display: grid;
            gap: 10px;
          }
          .analytics-habit-metricBox {
            padding: 14px;
            border-radius: 14px;
            background: rgba(12, 30, 48, 0.86);
            border: 1px solid rgba(110, 148, 189, 0.14);
          }
          .analytics-habit-metricLabel {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(220, 233, 255, 0.72);
          }
          .analytics-habit-metricValue {
            margin-top: 4px;
            font-size: 1.9rem;
            font-weight: 700;
            color: #29df83;
          }
          .analytics-habit-metricHint {
            margin-top: 4px;
            font-size: 12px;
            color: rgba(220, 233, 255, 0.7);
          }
          .analytics-habit-heatmap {
            display: grid;
            gap: 4px;
            align-items: center;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .analytics-habit-heatmap--mobile {
            display: none;
          }
          .analytics-habit-cell,
          .analytics-habit-dayCell,
          .analytics-habit-rowLabel,
          .analytics-habit-extraCell {
            min-width: 18px;
          }
          .analytics-habit-dayCell {
            font-size: 10px;
            color: rgba(218, 232, 255, 0.7);
            text-align: center;
            padding-bottom: 4px;
          }
          .analytics-habit-rowLabel {
            padding-right: 8px;
            font-size: 12px;
            color: #eef5ff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .analytics-habit-cell {
            height: 18px;
            border-radius: 4px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.05);
            padding: 0;
            appearance: none;
            -webkit-appearance: none;
          }
          .analytics-habit-cell--editable {
            cursor: pointer;
            transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
          }
          .analytics-habit-cell--editable:hover {
            transform: translateY(-1px);
            border-color: rgba(255,255,255,0.24);
            box-shadow: 0 0 0 1px rgba(255,255,255,0.08);
          }
          .analytics-habit-cell--done {
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
          }
          .analytics-habit-cell--future {
            opacity: 0.3;
          }
          .analytics-habit-cell--saving {
            opacity: 0.65;
            cursor: wait;
          }
          .analytics-habit-extraCell {
            font-size: 11px;
            color: rgba(220, 233, 255, 0.78);
            text-align: right;
            padding-left: 6px;
          }
          .analytics-habit-mobileDays,
          .analytics-habit-mobileStrip {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: 18px;
            gap: 4px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .analytics-habit-mobileDays {
            margin-bottom: 8px;
            padding-bottom: 4px;
          }
          .analytics-habit-mobileRow {
            padding: 10px;
            border-radius: 12px;
            background: rgba(12, 30, 48, 0.82);
            border: 1px solid rgba(110, 148, 189, 0.12);
          }
          .analytics-habit-mobileList {
            display: grid;
            gap: 8px;
          }
          .analytics-habit-mobileRowHead {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 8px;
          }
          .analytics-habit-mobileTitle {
            font-size: 12px;
            color: #eef5ff;
            font-weight: 600;
            min-width: 0;
          }
          .analytics-habit-mobileBadges {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            justify-content: flex-end;
            font-size: 10px;
            color: rgba(220, 233, 255, 0.82);
          }
          .analytics-habit-mobileBadge {
            padding: 3px 6px;
            border-radius: 999px;
            background: rgba(255,255,255,0.08);
            white-space: nowrap;
          }
          @media (max-width: 1100px) {
            .analytics-habit-header,
            .analytics-habit-body,
            .analytics-habit-metrics,
            .analytics-habit-ringRow { grid-template-columns: 1fr; }
          }
          @media (max-width: 768px) {
            .analytics-grid { grid-template-columns: 1fr; }
            .analytics-habit-shell { padding: 14px; border-radius: 18px; }
            .analytics-habit-titleCard,
            .analytics-habit-sideCard,
            .analytics-habit-panel { padding: 12px; }
            .analytics-habit-titleCard h2 { font-size: 1.55rem; }
            .analytics-habit-ringRow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .analytics-habit-metrics { grid-template-columns: 1fr; }
            .analytics-habit-heatmap--desktop { display: none; }
            .analytics-habit-heatmap--mobile { display: grid; }
            .analytics-habit-rowLabel { font-size: 11px; }
            .analytics-habit-dayCell { font-size: 9px; }
            .analytics-habit-cell { min-width: 20px; height: 20px; }
          }
        `}</style>
        <section className="analytics-habit-shell">
          <div className="analytics-habit-header">
            <div className="analytics-habit-titleCard">
              <p>{habitTracker?.monthLabel || "Daily habit tracker"} · {habitTracker?.templateName || "Daily Hits"}</p>
              <h2>Habit Tracker</h2>
              <p>
                Daily Hits completions, streaks, and month-to-date progress in one place.
              </p>
              <p style={{ marginTop: 10 }}>
                Click any past or current day square below to correct a Daily Hit after the fact.
              </p>
              {hasHabitTracker && (
                <div style={{ marginTop: 14, fontSize: 12, color: "rgba(220, 233, 255, 0.82)", display: "grid", gap: 4 }}>
                  <div>Start date: {habitTracker.stats.startDate}</div>
                  <div>End date: {habitTracker.stats.endDate}</div>
                  <div>Daily habits: {habitTracker.totalHabits}</div>
                  <div>Habit goals: {habitTracker.stats.goalsThisMonth}</div>
                </div>
              )}
            </div>

            <div className="analytics-habit-ringRow">
              {(habitTracker?.progressRings || []).map((ring) => (
                <div key={ring.label} className="analytics-habit-titleCard analytics-habit-ringCard">
                  <div className="analytics-habit-ring" style={{ background: ring.gradient }}>
                    <div className="analytics-habit-ringInner">{ring.valueLabel}</div>
                  </div>
                  <div className="analytics-habit-ringLabel">{ring.label}</div>
                </div>
              ))}
            </div>

            <div className="analytics-habit-sideCard">
              <h3 className="analytics-habit-sideTitle">Top habits</h3>
              {hasHabitTracker ? (
                <div className="analytics-habit-bars">
                  {habitTracker.topHabits.map((row, idx) => (
                    <div className="analytics-habit-barRow" key={row.id}>
                      <div>
                        <div className="analytics-habit-barMeta">
                          <span>{shortenChartLabel(row.title, 18)}</span>
                          <span>{row.monthCompleted}</span>
                        </div>
                        <div className="analytics-habit-barTrack">
                          <div
                            className="analytics-habit-barFill"
                            style={{
                              width: `${row.monthRate}%`,
                              background: ["#2ec5ff", "#2adf86", "#8a74ff", "#f2c94c", "#ff6b8b", "#4dd3a9"][idx % 6],
                            }}
                          />
                        </div>
                      </div>
                      <div className="analytics-habit-barValue">{row.monthRate}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "rgba(220, 233, 255, 0.72)" }}>
                  Add Daily Hits on the `Daily Hits` page to populate the tracker.
                </p>
              )}
            </div>
          </div>

          <div className="analytics-habit-body">
            <div className="analytics-habit-panel">
              {hasHabitTracker ? (
                <>
                  <div className="analytics-habit-metrics">
                    <div className="analytics-habit-metricStack">
                      <div className="analytics-habit-metricBox">
                        <div className="analytics-habit-metricLabel">Completed</div>
                        <div className="analytics-habit-metricValue">{habitTracker.stats.completedThisMonth}</div>
                        <div className="analytics-habit-metricHint">Month to date</div>
                      </div>
                      <div className="analytics-habit-metricBox">
                        <div className="analytics-habit-metricLabel">Remaining</div>
                        <div className="analytics-habit-metricValue" style={{ color: "#ff6b8b" }}>
                          {habitTracker.stats.remainingThisMonth}
                        </div>
                        <div className="analytics-habit-metricHint">Open habit reps this month</div>
                      </div>
                    </div>

                    <div className="analytics-habit-metricBox">
                      <div className="analytics-habit-metricLabel">Daily progress trend</div>
                      <div style={{ height: 180, marginTop: 10 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={habitTracker.trendData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(220,233,255,0.68)" }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "rgba(220,233,255,0.68)" }} />
                            <Tooltip
                              contentStyle={{ background: "#0c2134", border: "1px solid rgba(110, 148, 189, 0.24)" }}
                              labelStyle={{ color: "#eef5ff" }}
                            />
                            <Line type="monotone" dataKey="completed" stroke="#2adf86" strokeWidth={2.5} dot={false} name="Daily hits completed" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div
                    className="analytics-habit-heatmap analytics-habit-heatmap--desktop"
                    style={{
                      gridTemplateColumns: `190px repeat(${habitTracker.monthDays.length}, minmax(18px, 1fr)) 70px 58px`,
                    }}
                  >
                    <div className="analytics-habit-rowLabel analytics-habit-dayCell">Daily habits</div>
                    {habitTracker.monthDays.map((day) => (
                      <div key={`header-${day}`} className="analytics-habit-dayCell">
                        {new Date(`${day}T12:00:00`).getDate()}
                      </div>
                    ))}
                    <div className="analytics-habit-dayCell">Progress</div>
                    <div className="analytics-habit-dayCell">Streak</div>

                    {habitTracker.habitRows.map((row, idx) => (
                      <div key={row.id} style={{ display: "contents" }}>
                        <div key={`${row.id}-label`} className="analytics-habit-rowLabel" title={row.title}>
                          {row.title}
                        </div>
                        {habitTracker.monthDays.map((day) => {
                          const isFuture = day > habitTracker.stats.endDate;
                          const isDone = row.dates.has(day);
                          const editKey = `${row.id}:${day}`;
                          const isSaving = habitEditKey === editKey;
                          const fill = ["#20bdf2", "#24df84", "#8b73ff", "#d8ad2f", "#ff4d7e", "#32c7a0"][idx % 6];
                          return (
                            <button
                              type="button"
                              key={`${row.id}-${day}`}
                              className={`analytics-habit-cell${isDone ? " analytics-habit-cell--done" : ""}${isFuture ? " analytics-habit-cell--future" : " analytics-habit-cell--editable"}${isSaving ? " analytics-habit-cell--saving" : ""}`}
                              style={{ background: isDone ? fill : undefined }}
                              title={
                                isFuture
                                  ? `${row.title} · ${day} (future)`
                                  : `${row.title} · ${day}${isDone ? " complete" : " incomplete"} · click to toggle`
                              }
                              onClick={() => handleHabitDateToggle(row.id, day, isDone)}
                              disabled={isFuture || isSaving}
                              aria-label={`${isDone ? "Mark incomplete" : "Mark complete"} for ${row.title} on ${day}`}
                            />
                          );
                        })}
                        <div key={`${row.id}-progress`} className="analytics-habit-extraCell">
                          {row.monthCompleted}/{habitTracker.visibleMonthDays.length}
                        </div>
                        <div key={`${row.id}-streak`} className="analytics-habit-extraCell">
                          {row.currentStreak}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="analytics-habit-heatmap--mobile">
                    <div className="analytics-habit-mobileDays">
                      {habitTracker.monthDays.map((day) => (
                        <div key={`mobile-header-${day}`} className="analytics-habit-dayCell">
                          {new Date(`${day}T12:00:00`).getDate()}
                        </div>
                      ))}
                    </div>
                    <div className="analytics-habit-mobileList">
                      {habitTracker.habitRows.map((row, idx) => (
                        <div key={`mobile-${row.id}`} className="analytics-habit-mobileRow">
                          <div className="analytics-habit-mobileRowHead">
                            <div className="analytics-habit-mobileTitle">{row.title}</div>
                            <div className="analytics-habit-mobileBadges">
                              <span className="analytics-habit-mobileBadge">
                                {row.monthCompleted}/{habitTracker.visibleMonthDays.length}
                              </span>
                              <span className="analytics-habit-mobileBadge">
                                {row.currentStreak}d
                              </span>
                            </div>
                          </div>
                          <div className="analytics-habit-mobileStrip">
                            {habitTracker.monthDays.map((day) => {
                              const isFuture = day > habitTracker.stats.endDate;
                              const isDone = row.dates.has(day);
                              const editKey = `${row.id}:${day}`;
                              const isSaving = habitEditKey === editKey;
                              const fill = ["#20bdf2", "#24df84", "#8b73ff", "#d8ad2f", "#ff4d7e", "#32c7a0"][idx % 6];
                              return (
                                <button
                                  type="button"
                                  key={`mobile-${row.id}-${day}`}
                                  className={`analytics-habit-cell${isDone ? " analytics-habit-cell--done" : ""}${isFuture ? " analytics-habit-cell--future" : " analytics-habit-cell--editable"}${isSaving ? " analytics-habit-cell--saving" : ""}`}
                                  style={{ background: isDone ? fill : undefined }}
                                  title={
                                    isFuture
                                      ? `${row.title} · ${day} (future)`
                                      : `${row.title} · ${day}${isDone ? " complete" : " incomplete"} · tap to toggle`
                                  }
                                  onClick={() => handleHabitDateToggle(row.id, day, isDone)}
                                  disabled={isFuture || isSaving}
                                  aria-label={`${isDone ? "Mark incomplete" : "Mark complete"} for ${row.title} on ${day}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "rgba(220, 233, 255, 0.72)" }}>
                  No Daily Hits are configured yet. Add them on the `Daily Hits` page and they will appear here automatically.
                </p>
              )}
            </div>

            <div className="analytics-habit-sideCard">
              <h3 className="analytics-habit-sideTitle">Active streaks</h3>
              {hasHabitTracker && habitTracker.activeStreaks.length > 0 ? (
                <div className="analytics-habit-bars">
                  {habitTracker.activeStreaks.map((row, idx) => (
                    <div className="analytics-habit-barRow" key={row.id}>
                      <div>
                        <div className="analytics-habit-barMeta">
                          <span>{shortenChartLabel(row.title, 18)}</span>
                          <span>{row.currentStreak}d</span>
                        </div>
                        <div className="analytics-habit-barTrack">
                          <div
                            className="analytics-habit-barFill"
                            style={{
                              width: `${Math.min(row.currentStreak * 10, 100)}%`,
                              background: ["#2ec5ff", "#2adf86", "#8a74ff", "#f2c94c", "#ff6b8b", "#4dd3a9"][idx % 6],
                            }}
                          />
                        </div>
                      </div>
                      <div className="analytics-habit-barValue">{row.currentStreak}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "rgba(220, 233, 255, 0.72)" }}>
                  Complete a Daily Hit today to start a visible streak.
                </p>
              )}
            </div>
          </div>
        </section>
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
            Completions by human need strategy (30 days)
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 8, fontSize: 12 }}>
            Effort by human need strategy — set it on Action Items or via AI Enrich.
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
              Set a human need strategy on Action Items or run Apply enrichment to see effort here.
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
