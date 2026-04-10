import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import ProgressToOutcome from "../components/ProgressToOutcome";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import {
  getTemplates,
  getTemplateItems,
  getTaskEventsForTasksOnDate,
  getLastCompletedEventsForUser,
  getCompletedEventsInRange,
  logTaskEvent,
  getOrCreateWorkoutTaskId,
  getOrCreateDailyPlan,
  updateDailyPlan,
  createTask,
  setTaskTags,
  getUserProfile,
  getLiftingSetsWithSession,
} from "../lib/db";
import {
  loadCollaborativeBacklog,
  loadWorkspaceOrders,
  toggleCollaborativeTaskCompletion,
} from "../lib/collaborationClient";
import {
  MODES,
  buildRationale,
  chooseKeyOutcomes,
  computeTaskScore,
  getWorkoutPlanForDate,
  getEffectiveCategoryWeights,
} from "../lib/scoring";
import { OCCAM_CADENCE_SHORT } from "../lib/occam";
import {
  buildQueueCandidates,
  buildQueueFromChosen,
  promoteSubtaskToQueue,
  reduceParentsToBestSubtask,
} from "../lib/today-queue";

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildCompletionMap(events, workoutTaskId = null) {
  const byTask = {};
  for (const ev of events || []) {
    const completed = ev.event_type === "completed";
    if (workoutTaskId && ev.task_id === workoutTaskId && ev.value?.date) {
      byTask[`workout-${ev.value.date}`] = completed;
    } else {
      byTask[ev.task_id] = completed;
    }
  }
  return byTask;
}

function buildLastCompletedMap(events) {
  const map = {};
  for (const ev of events || []) {
    const existing = map[ev.task_id];
    if (
      !existing ||
      new Date(ev.created_at).getTime() > new Date(existing).getTime()
    ) {
      map[ev.task_id] = ev.created_at;
    }
  }
  return map;
}

function getNextActionHint(taskId, queueEntries, completionMap) {
  const isDone = !!completionMap[taskId];
  if (isDone) {
    const allDone = queueEntries.every((e) => !!completionMap[e.task?.id]);
    if (allDone) return { text: "All done \u2014 queue will refill", style: "success" };
    const remaining = queueEntries.filter((e) => !completionMap[e.task?.id]).length;
    return {
      text: `Done \u2014 ${remaining} left to unlock a fresh set`,
      style: "done",
    };
  }
  const firstUncompleted = queueEntries.find((e) => !completionMap[e.task?.id]);
  if (firstUncompleted?.task?.id === taskId) {
    return { text: "Up next \u2014 start here", style: "action" };
  }
  return null;
}

const HINT_STYLES = {
  action: {
    color: "var(--rs-primary-strong)",
    background: "rgba(245, 206, 83, 0.18)",
    border: "rgba(212, 175, 55, 0.45)",
  },
  done: {
    color: "var(--rs-on-surface-variant)",
    background: "var(--rs-surface-low)",
    border: "rgba(186, 177, 159, 0.25)",
  },
  success: {
    color: "var(--rs-olive)",
    background: "rgba(85, 93, 30, 0.1)",
    border: "rgba(85, 93, 30, 0.28)",
  },
};

function ConfettiOverlay({ seed }) {
  const pieces = Array.from({ length: 80 }, (_, i) => i);
  const colors = ["#22c55e", "#3b82f6", "#f97316", "#e11d48", "#a855f7"];

  return (
    <div
      key={seed}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 9999,
      }}
    >
      {pieces.map((i) => {
        const left = (i / pieces.length) * 100;
        const delay = (i % 10) * 0.15;
        const duration = 2 + (i % 5) * 0.3;
        const size = 6 + (i % 4) * 2;
        const color = colors[i % colors.length];
        return (
          <div
            key={`${seed}-${i}`}
            style={{
              position: "absolute",
              top: "-16px",
              left: `${left}%`,
              width: size,
              height: size * 0.4,
              background: color,
              borderRadius: 2,
              opacity: 0.9,
              transform: `rotate(${i * 11}deg)`,
              animationName: "rs-confetti-fall",
              animationDuration: `${duration}s`,
              animationTimingFunction: "ease-out",
              animationDelay: `${delay}s`,
              animationFillMode: "forwards",
            }}
          />
        );
      })}
      <style>{`
        @keyframes rs-confetti-fall {
          0% {
            transform: translate3d(0, -100px, 0) rotateZ(0deg);
            opacity: 1;
          }
          100% {
            transform: translate3d(0, 110vh, 0) rotateZ(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

export default function TodayPage() {
  const { user, isCheckingAuth } = useAuth();
  const [mode, setMode] = useState("Strategic Push");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- set in load(); activeTemplate/items drive UI
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [items, setItems] = useState([]);
  const [completionMap, setCompletionMap] = useState({});

  const [backlogTasks, setBacklogTasks] = useState([]);
  const [lastCompletedMap, setLastCompletedMap] = useState({});
  const [dailyHitsCompleted, setDailyHitsCompleted] = useState(0);
  const [otherCompletedToday, setOtherCompletedToday] = useState(0);
  const [completedTodayTasks, setCompletedTodayTasks] = useState([]);

  const [workspaceOrders, setWorkspaceOrders] = useState({});

  const [dailyPlan, setDailyPlan] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [isRefilling, setIsRefilling] = useState(false);

  const [workoutPlan, setWorkoutPlan] = useState(null);
  const [workoutTaskId, setWorkoutTaskId] = useState(null);

  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiCached, setAiCached] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState("");
  const [appliedSuccessVisible, setAppliedSuccessVisible] = useState(false);
  const [appliedDetails, setAppliedDetails] = useState(null);
  const [subtaskApplying, setSubtaskApplying] = useState(false);
  const [subtaskApplyError, setSubtaskApplyError] = useState("");

  const [profilePrefs, setProfilePrefs] = useState(null);
  const [showOnboardingCompleteBanner, setShowOnboardingCompleteBanner] = useState(false);

  const [showConfetti, setShowConfetti] = useState(false);
  const confettiSeedRef = useRef(0);
  /** null = not yet synced (skip confetti on first paint / after load) */
  const prevDailyHitsAllDoneRef = useRef(null);
  const prevNext3AllDoneRef = useRef(null);

  function triggerConfetti() {
    confettiSeedRef.current += 1;
    setShowConfetti(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setShowConfetti(false), 2500);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = window.localStorage.getItem("rs-onboarding-just-completed");
    if (flag === "task" || flag === "done") {
      window.localStorage.removeItem("rs-onboarding-just-completed");
      setShowOnboardingCompleteBanner(flag);
    }
  }, []);

  const todayStr = useMemo(() => getTodayDateStr(), []);

  const dateLabel = useMemo(() => {
    const d = new Date(`${todayStr}T12:00:00`);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [todayStr]);

  const dailyTemplateTaskIds = useMemo(() => {
    const ids = [];
    for (const it of items || []) {
      if (it.task && it.task.id) ids.push(it.task.id);
    }
    return ids;
  }, [items]);

  useEffect(() => {
    const dailyHitsSet = new Set(dailyTemplateTaskIds);
    const doneCount = dailyTemplateTaskIds.filter((taskId) => !!completionMap[taskId]).length;
    setDailyHitsCompleted(doneCount);

    const otherDoneCount = Object.keys(completionMap || {}).filter((taskId) => {
      if (!taskId || String(taskId).startsWith("workout-")) return false;
      if (dailyHitsSet.has(taskId)) return false;
      return !!completionMap[taskId];
    }).length;
    setOtherCompletedToday(otherDoneCount);
  }, [dailyTemplateTaskIds, completionMap]);

  // Load user preferences (category weights, quick-win minutes, default mode)
  useEffect(() => {
    if (!user) return;
    getUserProfile(user.id).then((res) => {
      if (!res.error && res.data && res.data.profile) {
        const p = res.data.profile;
        const prefs = p.preferences || null;
        setProfilePrefs(prefs);
        if (
          prefs &&
          typeof prefs.default_mode === "string" &&
          MODES.includes(prefs.default_mode) &&
          prefs.default_mode !== mode
        ) {
          setMode(prefs.default_mode);
        }
      }
    });
  }, [user, mode]);

  // Confetti only when transitioning into “all Daily Hits done” (not on every refresh if already done)
  useEffect(() => {
    const total = items?.length ?? 0;
    const allDone = total > 0 && dailyHitsCompleted === total;
    if (prevDailyHitsAllDoneRef.current === null) {
      prevDailyHitsAllDoneRef.current = allDone;
      return;
    }
    if (allDone && !prevDailyHitsAllDoneRef.current) {
      triggerConfetti();
    }
    prevDailyHitsAllDoneRef.current = allDone;
  }, [dailyHitsCompleted, items]);

  // Confetti when all three “Next 3” slots are completed (not when the queue merely fills to 3)
  useEffect(() => {
    const q = Array.isArray(queueEntries) ? queueEntries : [];
    const allDone =
      q.length === 3 && q.every((e) => e?.task?.id && !!completionMap[e.task.id]);
    if (prevNext3AllDoneRef.current === null) {
      prevNext3AllDoneRef.current = allDone;
      return;
    }
    if (allDone && !prevNext3AllDoneRef.current) {
      triggerConfetti();
    }
    prevNext3AllDoneRef.current = allDone;
  }, [queueEntries, completionMap]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const tRes = await getTemplates();
        if (tRes.error) {
          setError(tRes.error.message);
          setLoading(false);
          return;
        }

        const allTemplates = tRes.data || [];
        setTemplates(allTemplates);

        const def =
          allTemplates.find((x) => x.is_default) || allTemplates[0] || null;

        let loadedItems = [];
        if (!def) {
          setActiveTemplate(null);
          setItems([]);
        } else {
          setActiveTemplate(def);
          const iRes = await getTemplateItems(def.id);
          if (iRes.error) {
            setError(iRes.error.message);
            setLoading(false);
            return;
          }
          loadedItems = iRes.data || [];
          setItems(loadedItems);
        }

        const [profRes, liftSetsRes] = await Promise.all([
          getUserProfile(user.id),
          getLiftingSetsWithSession(user.id, 500),
        ]);
        const profileForOccam = profRes.data?.profile;
        const wp = getWorkoutPlanForDate(todayStr, {
          preferences: profileForOccam?.preferences,
          setsWithSession: liftSetsRes.data || [],
          now: new Date(),
        });
        setWorkoutPlan(wp);

        const itemTaskIds = loadedItems
          .map((it) => it.task && it.task.id)
          .filter(Boolean);
        let workoutId = null;
        if (wp) {
          const wRes = await getOrCreateWorkoutTaskId(user.id);
          if (!wRes.error) workoutId = wRes.data;
          setWorkoutTaskId(workoutId);
        }
        const allIds = [...itemTaskIds, ...(workoutId ? [workoutId] : [])];

        if (user && allIds.length > 0) {
          const evRes = await getTaskEventsForTasksOnDate(
            user.id,
            allIds,
            todayStr
          );
          if (!evRes.error) {
            setCompletionMap(buildCompletionMap(evRes.data || [], workoutId));
          }
        } else {
          setCompletionMap({});
        }

        const [tasksData, lastRes, planRes, ordersData] = await Promise.all([
          loadCollaborativeBacklog(false),
          getLastCompletedEventsForUser(user.id),
          getOrCreateDailyPlan(user.id, todayStr, mode),
          loadWorkspaceOrders().catch(() => ({ orders: {} })),
        ]);

        setBacklogTasks(tasksData.tasks || []);
        setWorkspaceOrders(ordersData.orders || {});

        if (!lastRes.error) {
          setLastCompletedMap(buildLastCompletedMap(lastRes.data || []));
        }

        const plan = planRes.error ? null : planRes.data;
        setDailyPlan(plan);

        const tasks = tasksData.tasks || [];
        const catIdToName = {};
        tasks.forEach((t) => {
          if (t.category_id) {
            const name = typeof t.category === "string" ? t.category : t.category?.name;
            if (name) catIdToName[t.category_id] = name;
          }
        });
        const seedWeights = getEffectiveCategoryWeights(profilePrefs, catIdToName);
        const dailyIds = (loadedItems || []).map((it) => it.task?.id).filter(Boolean);
        const reduced = reduceParentsToBestSubtask(tasks, {
          dailyTemplateTaskIds: dailyIds,
          mode,
          now: new Date(),
          lastCompletedMap: buildLastCompletedMap(lastRes.data || []),
          baseCategoryWeights: seedWeights,
          quickWinMinutes: profilePrefs?.quick_win_definition_minutes,
        });
        const candidates = buildQueueCandidates(reduced, dailyIds);
        const tasksById = new Map(candidates.map((t) => [t.id, t]));

        const queue = (plan?.queue && Array.isArray(plan.queue)) ? plan.queue : [];
        const resolved = queue
          .map((slot) => {
            const task = slot.task_id ? tasksById.get(slot.task_id) : null;
            if (!task) return null;
            return { task, slotType: slot.type || "Progress", task_id: slot.task_id };
          })
          .filter(Boolean);

        const hasPersistedQueue = Array.isArray(plan?.queue) && plan.queue.length > 0;
        const shouldSeedInitialQueue = plan && !hasPersistedQueue && candidates.length > 0;
        if (shouldSeedInitialQueue) {
          const chosen = chooseKeyOutcomes(candidates, {
            mode,
            todayStr,
            lastCompletedMap: buildLastCompletedMap(lastRes.data || []),
            baseCategoryWeights: seedWeights,
            quickWinMinutes: profilePrefs?.quick_win_definition_minutes,
          });
          const newQueue = buildQueueFromChosen(chosen);
          const nextCount = (plan.refilled_count || 0) + 1;
          const up = await updateDailyPlan(plan.id, {
            queue: newQueue,
            refilled_count: nextCount,
            last_refilled_at: new Date().toISOString(),
          });
          if (!up.error && up.data) {
            setDailyPlan(up.data);
            setQueueEntries(
              chosen.map((entry, idx) => ({
                task: entry.task,
                slotType: ["Quick Win", "High Leverage", "Progress"][idx] || "Progress",
                task_id: entry.task.id,
              }))
            );
          } else {
            setQueueEntries(resolved);
          }
        } else {
          setQueueEntries(resolved);
        }

        const todayEventsRes = await getCompletedEventsInRange(
          user.id,
          todayStr,
          todayStr
        );
        if (!todayEventsRes.error && todayEventsRes.data) {
          const events = todayEventsRes.data || [];
          const dailyHitsSet = new Set(itemTaskIds);
          const dailyHitsDone = new Set(
            events.filter((e) => dailyHitsSet.has(e.task_id)).map((e) => e.task_id)
          ).size;
          const otherDone = new Set(
            events.filter((e) => !dailyHitsSet.has(e.task_id)).map((e) => e.task_id)
          ).size;
          setDailyHitsCompleted(dailyHitsDone);
          setOtherCompletedToday(otherDone);

          // Build completed tasks list for Today's Actions summary
          const completedTaskIds = [...new Set(events.map((e) => e.task_id))];
          if (completedTaskIds.length > 0) {
            const taskMap = {};
            for (const t of (tasksData.tasks || [])) {
              taskMap[t.id] = t;
            }
            setCompletedTodayTasks(
              completedTaskIds
                .map((id) => taskMap[id])
                .filter(Boolean)
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  category: typeof t.category === "string" ? t.category : t.category?.name || "",
                }))
            );
          }
        }
      } catch (e) {
        setError(e.message || "Failed to load today view.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [
    user,
    todayStr,
    mode,
    profilePrefs?.base_category_weights,
    profilePrefs?.quick_win_definition_minutes,
  ]);

  // Fetch completion state for queue task IDs so checkboxes reflect DB
  const categoryIdToName = useMemo(() => {
    const m = {};
    (backlogTasks || []).forEach((t) => {
      if (t.category_id) {
        const name = typeof t.category === "string" ? t.category : t.category?.name;
        if (name) m[t.category_id] = name;
      }
    });
    return m;
  }, [backlogTasks]);

  const effectiveCategoryWeights = useMemo(
    () => getEffectiveCategoryWeights(profilePrefs, categoryIdToName),
    [profilePrefs, categoryIdToName]
  );

  // --- Next Actions: one best task per project, ordered by project priority ---
  // Respects manual ordering (task_order_ids) when set, falls back to scoring.
  // Skips tasks tagged as blocked or blocked-by:*.
  const projectNextActions = useMemo(() => {
    if (!backlogTasks || backlogTasks.length === 0) return [];

    const dailyIds = new Set(dailyTemplateTaskIds);

    // Group open tasks by category
    const byCategory = {};
    for (const task of backlogTasks) {
      if (task.status === "archived" || task.status === "done") continue;
      if (dailyIds.has(task.id)) continue;
      const catId = task.category_id || "__none__";
      if (!byCategory[catId]) byCategory[catId] = [];
      byCategory[catId].push(task);
    }

    const priorityScores = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    const result = [];

    for (const [catId, tasks] of Object.entries(byCategory)) {
      const catName = categoryIdToName[catId] || "Uncategorized";
      const catWeight = effectiveCategoryWeights[catName] || 1;
      const projectOrder = workspaceOrders[catId]?.task_order_ids || [];

      // Filter out blocked tasks
      const eligible = tasks.filter((task) => {
        const tags = Array.isArray(task.tags)
          ? task.tags.map((t) => (typeof t === "string" ? t : t?.tag?.name || t?.name)).filter(Boolean)
          : [];
        const isBlocked = tags.some((t) =>
          t.toLowerCase() === "blocked" ||
          t.toLowerCase() === "waiting" ||
          t.toLowerCase().startsWith("blocked-by:")
        );
        return !isBlocked;
      });

      if (eligible.length === 0) continue;

      // If manual order exists, use the first eligible task in that order
      let best = null;
      if (projectOrder.length > 0) {
        const eligibleIds = new Set(eligible.map((t) => t.id));
        const firstInOrder = projectOrder.find((id) => eligibleIds.has(id));
        if (firstInOrder) {
          best = eligible.find((t) => t.id === firstInOrder);
        }
      }

      // Fall back to scoring-based selection
      if (!best) {
        const scored = eligible.map((task) => {
          const tags = Array.isArray(task.tags)
            ? task.tags.map((t) => (typeof t === "string" ? t : t?.tag?.name || t?.name)).filter(Boolean)
            : [];
          let score = 0;
          if (task.parent_task_id) score += 10;
          score += (priorityScores[task.priority] || 2) * 3;
          const effort = task.effort_hours || 1;
          score += Math.max(0, 8 - effort * 2);
          if (tags.includes("quick-win") || tags.includes("easy-win")) score += 5;
          if (task.status === "doing") score += 4;
          if (task.due_date && task.due_date < todayStr) score += 8;
          if (task.due_date === todayStr) score += 6;
          return { task, score };
        });
        scored.sort((a, b) => b.score - a.score);
        best = scored[0]?.task;
      }

      if (!best) continue;

      const tags = Array.isArray(best.tags)
        ? best.tags.map((t) => (typeof t === "string" ? t : t?.tag?.name || t?.name)).filter(Boolean)
        : [];

      result.push({
        task: best,
        tags,
        category: catName,
        categoryId: catId,
        categoryWeight: catWeight,
        remainingInProject: eligible.length,
      });
    }

    result.sort((a, b) => b.categoryWeight - a.categoryWeight);
    return result;
  }, [backlogTasks, dailyTemplateTaskIds, categoryIdToName, effectiveCategoryWeights, todayStr, workspaceOrders]);

  const queueTaskIds = useMemo(
    () => queueEntries.map((e) => e.task_id || e.task?.id).filter(Boolean),
    [queueEntries]
  );
  const queueTaskIdsKey = useMemo(() => queueTaskIds.join(","), [queueTaskIds]);

  const nextActionLabel = useMemo(() => {
    if (!Array.isArray(queueEntries) || queueEntries.length === 0) return "";
    const next = queueEntries.find((e) => e?.task?.id && !completionMap[e.task.id]);
    if (!next?.task?.title) return "";
    return `Up next: "${next.task.title}"`;
  }, [queueEntries, completionMap]);

  const isMorningFirstBlock = useMemo(() => {
    if (!Array.isArray(queueEntries) || queueEntries.length === 0) return false;
    const now = new Date();
    const hour = now.getHours();
    const isMorning = hour < 12;
    if (!isMorning) return false;
    const anyQueueCompleted = queueEntries.some((e) => !!completionMap[e.task?.id]);
    if (anyQueueCompleted) return false;
    const refilledCount = dailyPlan?.refilled_count ?? 0;
    return refilledCount === 0;
  }, [queueEntries, completionMap, dailyPlan]);

  const isLateMorningExecution = useMemo(() => {
    if (!Array.isArray(queueEntries) || queueEntries.length === 0) return false;
    const now = new Date();
    const hourFraction = now.getHours() + now.getMinutes() / 60;
    const isLateMorning = hourFraction >= 10.5 && hourFraction < 12;
    if (!isLateMorning) return false;
    const anyQueueCompleted = queueEntries.some((e) => !!completionMap[e.task?.id]);
    const refilledCount = dailyPlan?.refilled_count ?? 0;
    const hasEvidenceOfProgressOrRefill = anyQueueCompleted || refilledCount > 0;
    if (!hasEvidenceOfProgressOrRefill) return false;
    return true;
  }, [queueEntries, completionMap, dailyPlan]);

  const isAfterLunchExecution = useMemo(() => {
    if (!Array.isArray(queueEntries) || queueEntries.length === 0) return false;
    const now = new Date();
    const hourFraction = now.getHours() + now.getMinutes() / 60;
    const isAfternoonBlock = hourFraction >= 12 && hourFraction < 17.5;
    if (!isAfternoonBlock) return false;
    const anyQueueCompleted = queueEntries.some((e) => !!completionMap[e.task?.id]);
    const refilledCount = dailyPlan?.refilled_count ?? 0;
    const hasEvidenceOfProgressOrRefill = anyQueueCompleted || refilledCount > 0;
    if (!hasEvidenceOfProgressOrRefill) return false;
    return true;
  }, [queueEntries, completionMap, dailyPlan]);

  const isLateAfternoonExecution = useMemo(() => {
    if (!Array.isArray(queueEntries) || queueEntries.length === 0) return false;
    const now = new Date();
    const hourFraction = now.getHours() + now.getMinutes() / 60;
    const isLateAfternoonBlock = hourFraction >= 15.5 && hourFraction < 21;
    if (!isLateAfternoonBlock) return false;
    const anyQueueCompleted = queueEntries.some((e) => !!completionMap[e.task?.id]);
    const refilledCount = dailyPlan?.refilled_count ?? 0;
    const hasEvidenceOfProgressOrRefill = anyQueueCompleted || refilledCount > 0;
    if (!hasEvidenceOfProgressOrRefill) return false;
    return true;
  }, [queueEntries, completionMap, dailyPlan]);
  useEffect(() => {
    if (!user || !queueTaskIdsKey || !todayStr) return;
    const ids = queueTaskIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return;
    getTaskEventsForTasksOnDate(user.id, ids, todayStr).then((res) => {
      if (res.error) return;
      const map = buildCompletionMap(res.data || [], null);
      setCompletionMap((prev) => ({ ...prev, ...map }));
    });
  }, [user, todayStr, queueTaskIdsKey]);

  async function refillQueue() {
    if (!user || !dailyPlan || isRefilling) return;
    const reduced = reduceParentsToBestSubtask(backlogTasks || [], {
      dailyTemplateTaskIds,
      mode,
      now: new Date(),
      lastCompletedMap,
      baseCategoryWeights: effectiveCategoryWeights,
      quickWinMinutes: profilePrefs?.quick_win_definition_minutes,
    });
    const candidates = buildQueueCandidates(reduced, dailyTemplateTaskIds);
    if (candidates.length === 0) {
      setQueueEntries([]);
      return;
    }
    setIsRefilling(true);
    const chosen = chooseKeyOutcomes(candidates, {
      mode,
      todayStr,
      lastCompletedMap,
      baseCategoryWeights: effectiveCategoryWeights,
      quickWinMinutes: profilePrefs?.quick_win_definition_minutes,
    });
    const newQueue = buildQueueFromChosen(chosen);
    const nextCount = (dailyPlan.refilled_count || 0) + 1;
    const up = await updateDailyPlan(dailyPlan.id, {
      queue: newQueue,
      refilled_count: nextCount,
      last_refilled_at: new Date().toISOString(),
    });
    if (!up.error && up.data) {
      setDailyPlan(up.data);
      setQueueEntries(
        chosen.map((entry, idx) => ({
          task: entry.task,
          slotType: ["Quick Win", "High Leverage", "Progress"][idx] || "Progress",
          task_id: entry.task.id,
        }))
      );
    }
    setIsRefilling(false);
  }

  async function toggleTaskCompletion(taskId) {
    if (!user || !taskId) return;
    const isCompleted = !!completionMap[taskId];
    const nextType = isCompleted ? "uncompleted" : "completed";
    const isWorkoutSynthetic = typeof taskId === "string" && taskId.startsWith("workout-");
    const isDailyHitTask = dailyTemplateTaskIds.includes(taskId);
    const effectiveTaskId = isWorkoutSynthetic ? workoutTaskId : taskId;
    const value = isWorkoutSynthetic ? { date: taskId.replace("workout-", "") } : null;
    if (!effectiveTaskId) return;

    if (isWorkoutSynthetic || isDailyHitTask) {
      const res = await logTaskEvent(user.id, effectiveTaskId, nextType, value);
      if (res.error) return;
    } else {
      try {
        await toggleCollaborativeTaskCompletion(effectiveTaskId, nextType === "completed");
      } catch {
        return;
      }
    }

    const optimisticMap = { ...completionMap, [taskId]: !isCompleted };
    setCompletionMap(optimisticMap);

    // Re-check completion from DB and refill only when all 3 are done (NEXT_ACTION_ALGO_V2).
    // Single path: refill only after server-fresh completion state to avoid races/stale UI.
    const ids = (queueTaskIds || []).filter(Boolean);
    if (ids.length === 3) {
      const fresh = await getTaskEventsForTasksOnDate(user.id, ids, todayStr);
      if (!fresh.error) {
        const refreshedMap = buildCompletionMap(fresh.data || [], workoutTaskId);
        const merged = { ...optimisticMap, ...refreshedMap };
        setCompletionMap(merged);
        if (!isCompleted && ids.every((id) => !!merged[id])) {
          await refillQueue();
        }
      }
    }

    const todayRes = await getCompletedEventsInRange(user.id, todayStr, todayStr);
    if (!todayRes.error && todayRes.data) {
      const events = todayRes.data || [];
      const merged = { ...optimisticMap };
      events.forEach((event) => {
        merged[event.task_id] = true;
      });
      setCompletionMap((prev) => ({ ...prev, ...merged }));
    }
  }

  function handleRefreshQueue() {
    refillQueue();
  }

  async function handleRefineWithAi() {
    if (!user || aiLoading) return;
    if (!Array.isArray(queueEntries) || queueEntries.length !== 3) {
      setAiError("Refill your queue first (3 tasks needed).");
      setAiStatus("error");
      return;
    }
    setAppliedSuccessVisible(false);
    setAppliedDetails(null);
    setAiLoading(true);
    setAiError("");
    setAiStatus("loading");
    setAiSuggestions(null);
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData?.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token;
        sessionData = refreshed;
      }
      if (!token) {
        setAiStatus("error");
        setAiError("Auth session missing. Please refresh and sign in again.");
        return;
      }

      const res = await fetch("/api/planner/ai-refine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: todayStr }),
      });
      const responseText = await res.text();
      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw_text: responseText };
      }
      if (!res.ok) {
        const isAuthError = res.status === 401;
        const msg = isAuthError
          ? "Session expired or invalid. Please refresh the page and sign in again."
          : (data.error || data.raw_text || (data.raw ? "AI returned non-JSON output. Try again." : `AI suggestions unavailable (${res.status}).`));
        setAiStatus("error");
        setAiError(msg);
        setAiSuggestions(null);
        return;
      }
      const ai = data.ai;
      if (!ai || typeof ai !== "object") {
        setAiStatus("error");
        setAiError("AI suggestions unavailable. Please try again.");
        setAiSuggestions(null);
        return;
      }
      setAiCached(!!data.cached);
      if (data.ai_status && data.ai_status !== 'ok') {
        setAiStatus(data.ai_status);
        setAiError(`Planner fallback used: ${data.ai_status.replace('fallback:', '')}.`);
      } else {
        setAiStatus(data.cached ? "cached" : "ok");
      }
      setAiSuggestions({
        task_refinements: Array.isArray(ai.task_refinements) ? ai.task_refinements : [],
        suggested_subtasks_to_create: Array.isArray(ai.suggested_subtasks_to_create) ? ai.suggested_subtasks_to_create : [],
        automation_opportunities: Array.isArray(ai.automation_opportunities) ? ai.automation_opportunities : [],
      });
    } catch (e) {
      setAiStatus("error");
      setAiError(e?.message || "AI suggestions unavailable. Please try again.");
      setAiSuggestions(null);
    } finally {
      setAiLoading(false);
    }
  }

  async function logRefinementEvent(action, item, extra = {}) {
    if (!user || !item?.task_id || !action) return;
    try {
      await logTaskEvent(user.id, item.task_id, "updated", {
        source: "planner_refinement",
        action,
        ...extra,
      });
    } catch {
      // analytics logging should not block UX flows
    }
  }

  function dismissRefinement(index, item = null) {
    if (item?.task_id) {
      void logRefinementEvent("dismiss", item);
    }
    setAiSuggestions((prev) => ({
      ...prev,
      task_refinements: (prev?.task_refinements || []).filter((_, i) => i !== index),
    }));
  }

  async function handleApproveRefinement(item, index) {
    if (!user) return;
    const existingTask =
      queueEntries.find((e) => e?.task?.id === item.task_id)?.task ||
      backlogTasks.find((t) => t?.id === item.task_id) ||
      null;
    const before = existingTask
      ? {
          title: existingTask.title ?? null,
          effort_hours: existingTask.effort_hours ?? null,
          tags: Array.isArray(existingTask.tags)
            ? existingTask.tags.map((t) => t?.tag?.name).filter(Boolean)
            : [],
        }
      : null;
    const payload = {
      task_id: item.task_id,
      suggested_title: item.suggested_title,
      suggested_tags_add: item.suggested_tags_add,
      suggested_effort_minutes: item.suggested_effort_minutes,
    };

    await logRefinementEvent("accept", item);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setAppliedMessage("");
        setError("Auth session missing. Please refresh and sign in again.");
        return;
      }

      const res = await fetch("/api/planner/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Failed to apply refinement. Please try again.";
        setAppliedMessage(msg);
        setTimeout(() => setAppliedMessage(""), 5000);
        return;
      }

      const taskUpdate = data.task || {};
      const tagNames = Array.isArray(data.tags) ? data.tags : null;
      const after = {
        title: taskUpdate.title ?? before?.title ?? null,
        effort_hours:
          taskUpdate.effort_hours ?? before?.effort_hours ?? null,
        tags:
          tagNames != null
            ? tagNames
            : before?.tags || [],
      };
      const changes = [];
      if (before?.title != null && after.title != null && before.title !== after.title) {
        changes.push({ field: "title", from: before.title, to: after.title });
      }
      if (
        before?.effort_hours != null &&
        after.effort_hours != null &&
        before.effort_hours !== after.effort_hours
      ) {
        changes.push({
          field: "effort",
          from: `${before.effort_hours}h`,
          to: `${after.effort_hours}h`,
        });
      }
      if (tagNames != null) {
        const beforeTags = new Set(before?.tags || []);
        const afterTags = new Set(after.tags || []);
        const added = [...afterTags].filter((t) => !beforeTags.has(t));
        if (added.length > 0) {
          changes.push({
            field: "tags_added",
            to: added.join(", "),
          });
        }
      }

      setQueueEntries((prev) =>
        prev.map((e) => {
          if (e.task?.id !== item.task_id) return e;
          return {
            ...e,
            task: {
              ...e.task,
              title: taskUpdate.title ?? e.task.title,
              effort_hours: taskUpdate.effort_hours ?? e.task.effort_hours,
              tags:
                tagNames != null
                  ? tagNames.map((name) => ({ tag: { name } }))
                  : e.task.tags,
            },
          };
        })
      );

      setBacklogTasks((prev) =>
        (prev || []).map((t) => {
          if (t.id !== item.task_id) return t;
          return {
            ...t,
            title: taskUpdate.title ?? t.title,
            effort_hours: taskUpdate.effort_hours ?? t.effort_hours,
            tags: tagNames != null ? tagNames.map((name) => ({ tag: { name } })) : t.tags,
          };
        })
      );

      const label = taskUpdate.title || item.suggested_title || "task";
      setAppliedMessage(`Refinement applied to "${label}".`);
      setAppliedSuccessVisible(true);
      setAppliedDetails({
        kind: "task_refinement",
        task_id: item.task_id,
        before,
        after,
        changes,
      });
      setTimeout(() => setAppliedMessage(""), 3000);
      dismissRefinement(index, null);
    } catch {
      setAppliedMessage("Failed to apply refinement. Please try again.");
      setTimeout(() => setAppliedMessage(""), 5000);
    }
  }

  function dismissAutomation(index) {
    setAiSuggestions((prev) => ({
      ...prev,
      automation_opportunities: (prev?.automation_opportunities || []).filter((_, i) => i !== index),
    }));
  }

  function handleExploreAutomation(index) {
    const item = (aiSuggestions?.automation_opportunities || [])[index];
    if (item) console.log("Explore automation (placeholder):", item);
    dismissAutomation(index);
  }

  async function handleApplyOrchestrated(approvedSubtasks) {
    if (!user || !Array.isArray(approvedSubtasks) || approvedSubtasks.length === 0) return;
    setSubtaskApplying(true);
    setSubtaskApplyError("");
    setAppliedMessage("");
    setAppliedSuccessVisible(false);
    setAppliedDetails(null);

    const total = approvedSubtasks.length;
    try {
      const created = [];
      const failures = [];
      for (const sub of approvedSubtasks) {
        const effortHours = sub.estimated_minutes != null ? sub.estimated_minutes / 60 : null;
        const res = await createTask(user.id, {
          title: sub.title,
          parent_task_id: sub.parent_task_id,
          status: "todo",
          effort_hours: effortHours ?? undefined,
        });
        if (res.error) {
          failures.push(sub.title || "Untitled");
          continue;
        }
        const tagNames = Array.isArray(sub.tags) ? sub.tags : [];
        if (tagNames.length > 0 && res.data?.id) {
          await setTaskTags(user.id, res.data.id, tagNames);
        }
        created.push({ ...res.data, _source: sub });
      }

      if (created.length === 0) {
        setSubtaskApplyError(
          `Failed to create ${total === 1 ? "the subtask" : `all ${total} subtasks`}. Check your connection and try again.`
        );
        setSubtaskApplying(false);
        return;
      }

      const bestSubtask = created[0];
      const parentTaskId = bestSubtask._source?.parent_task_id;
      const currentQueue = dailyPlan?.queue;
      let promoted = false;

      if (bestSubtask.id && parentTaskId && Array.isArray(currentQueue)) {
        const newQueue = promoteSubtaskToQueue(currentQueue, parentTaskId, bestSubtask.id);
        if (newQueue && dailyPlan?.id) {
          const up = await updateDailyPlan(dailyPlan.id, { queue: newQueue });
          if (!up.error && up.data) {
            setDailyPlan(up.data);
            promoted = true;
            setQueueEntries((prev) =>
              prev.map((e) => {
                if (e.task_id !== parentTaskId && e.task?.id !== parentTaskId) return e;
                return {
                  ...e,
                  task: bestSubtask,
                  task_id: bestSubtask.id,
                };
              })
            );
          }
        }
      }

      const backlogAdditions = created.slice(1);
      if (backlogAdditions.length > 0) {
        setBacklogTasks((prev) => [...(prev || []), ...backlogAdditions]);
      }

      setAiSuggestions((prev) => ({
        ...prev,
        suggested_subtasks_to_create: [],
      }));

      const bestLabel = bestSubtask.title || "subtask";
      const parts = [];
      parts.push(`Created ${created.length} of ${total} subtask${total !== 1 ? "s" : ""}.`);
      if (promoted) {
        parts.push(`"${bestLabel}" now in your Next-3.`);
      } else {
        parts.push(`"${bestLabel}" added to backlog (parent not in current queue).`);
      }
      if (backlogAdditions.length > 0) {
        parts.push(`${backlogAdditions.length} more sent to backlog.`);
      }
      if (failures.length > 0) {
        parts.push(`${failures.length} failed to create.`);
      }
      setAppliedMessage(parts.join(" "));
      setAppliedSuccessVisible(true);
      setAppliedDetails({
        kind: "subtasks_created",
        created: created.length,
        attempted: total,
        promoted,
        promoted_title: promoted ? bestLabel : null,
        failures: failures.length,
      });
      setTimeout(() => setAppliedMessage(""), 6000);
    } catch (e) {
      setSubtaskApplyError(e?.message || "Failed to apply subtask orchestration. Please try again.");
    } finally {
      setSubtaskApplying(false);
    }
  }

  function handleDismissAllSubtasks() {
    setAiSuggestions((prev) => ({
      ...prev,
      suggested_subtasks_to_create: [],
    }));
  }

  const taskTitleById = useMemo(() => {
    const m = new Map();
    for (const e of queueEntries) m.set(e.task?.id, e.task?.title);
    return m;
  }, [queueEntries]);

  const queueReasonByTaskId = useMemo(() => {
    const reasons = new Map();
    for (const entry of queueEntries || []) {
      const task = entry?.task;
      if (!task?.id) continue;
      const scoring = computeTaskScore(task, {
        mode,
        now: new Date(),
        lastCompletedAt: lastCompletedMap[task.id] || null,
        baseCategoryWeights: profilePrefs?.base_category_weights,
        quickWinMinutes: profilePrefs?.quick_win_definition_minutes,
      });
      reasons.set(task.id, buildRationale(task, scoring, mode));
    }
    return reasons;
  }, [
    queueEntries,
    mode,
    lastCompletedMap,
    profilePrefs?.base_category_weights,
    profilePrefs?.quick_win_definition_minutes,
  ]);

  // Prefer AI-generated "why this task now" when present (from Refine with AI)
  const displayReasonByTaskId = useMemo(() => {
    const m = new Map(queueReasonByTaskId);
    for (const r of aiSuggestions?.task_refinements || []) {
      if (r.why_this_task_now && r.task_id) {
        m.set(r.task_id, String(r.why_this_task_now).trim());
      }
    }
    return m;
  }, [queueReasonByTaskId, aiSuggestions?.task_refinements]);

  // Show loading when: still checking auth, no user (redirecting), or data loading
  if (isCheckingAuth || !user || loading) {
    return (
      <DashboardLayout>
        {showConfetti && <ConfettiOverlay seed={confettiSeedRef.current} />}
        <p style={{ fontSize: 14, color: "var(--rs-on-surface-variant)" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {showConfetti && <ConfettiOverlay seed={confettiSeedRef.current} />}
      <PageHeader
        eyebrow="Morning intentions"
        title="Today"
        subtitle={dateLabel}
        right={
          <div className="today-header-controls rs-toolbar">
            <label
              style={{
                fontSize: 13,
                color: "var(--rs-on-surface-variant)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 600,
              }}
            >
              Mode
              <select
                className="rs-select-compact"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rs-btn-ghost"
              onClick={handleRefreshQueue}
              disabled={isRefilling}
              style={{ cursor: isRefilling ? "wait" : "pointer", opacity: isRefilling ? 0.65 : 1 }}
            >
              {isRefilling ? "Refilling…" : "Refresh queue"}
            </button>
          </div>
        }
      />

      {showOnboardingCompleteBanner && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: 12,
            fontSize: 13,
            color: "#166534",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            {showOnboardingCompleteBanner === "task"
              ? "Onboarding complete. Your first step was added as a task. Tap \"Refresh queue\" below to see it in your Next 3."
              : "Onboarding complete. Tap \"Refresh queue\" below to get your Next 3 actions."}
          </span>
          <button
            type="button"
            onClick={() => setShowOnboardingCompleteBanner(false)}
            style={{
              flexShrink: 0,
              padding: "4px 8px",
              fontSize: 12,
              border: "1px solid #86efac",
              borderRadius: 6,
              background: "#ffffff",
              color: "#166534",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div
        className={`rs-today-progress-occam${!workoutPlan ? " rs-today-progress-occam--solo" : ""}`}
      >
        <ProgressToOutcome
          queueEntries={queueEntries}
          completionMap={completionMap}
          dailyHitsTotal={items?.length ?? 0}
          dailyHitsCompleted={dailyHitsCompleted}
          otherCompletedToday={otherCompletedToday}
        />

        {workoutPlan && (
          <aside className="rs-today-occam-aside" aria-label="Occam workout">
            <SectionCard
              title="Occam workout"
              subtitle={
                workoutTaskId
                  ? `${workoutPlan.phase}${workoutPlan.occamLabel ? ` · ${workoutPlan.occamLabel}` : ""}`
                  : "Workout tracking unavailable. Add a Daily Repeat category (e.g. in Backlog) to enable."
              }
            >
              <div className="rs-today-occam-aside__head">
                <div className="rs-today-occam-aside__icon" aria-hidden>
                  <span className="material-symbols-outlined">fitness_center</span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--rs-on-surface-variant)",
                    lineHeight: 1.45,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  Barbell home template — two lifts per session.
                </p>
              </div>
              {workoutTaskId ? (
                <div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--rs-on-surface-variant)",
                      margin: "0 0 10px",
                      lineHeight: 1.45,
                    }}
                  >
                    {workoutPlan.scheduleMode === "recovery" && workoutPlan.recoveryEndsAt ? (
                      <>
                        <strong>Recovery</strong> until{" "}
                        {workoutPlan.recoveryEndsAt.toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        . Next heavy: <strong>{workoutPlan.nextWorkoutAfterRecovery}</strong>.{" "}
                      </>
                    ) : null}
                    {OCCAM_CADENCE_SHORT}. Log working weights on the Occam Workout page.
                  </p>
                  {workoutPlan.exercises?.length > 0 && (
                    <ul
                      style={{
                        margin: "0 0 12px",
                        paddingLeft: 18,
                        fontSize: 13,
                        color: "var(--rs-on-surface)",
                        lineHeight: 1.45,
                      }}
                    >
                      {workoutPlan.exercises.map((ex) => (
                        <li key={ex.key} style={{ marginBottom: 6 }}>
                          <strong>{ex.name}</strong> — target {ex.targetReps} ({ex.detail})
                        </li>
                      ))}
                    </ul>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!completionMap[workoutPlan.id]}
                        onChange={() => toggleTaskCompletion(workoutPlan.id)}
                        style={{
                          width: 20,
                          height: 20,
                          accentColor: "var(--rs-accent-gold)",
                        }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Mark today complete</span>
                    </label>
                    <Link
                      href="/health"
                      className="rs-btn-ghost"
                      style={{ textDecoration: "none", fontSize: 13 }}
                    >
                      Open Occam Workout →
                    </Link>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--rs-on-surface-variant)", margin: 0 }}>
                  {workoutPlan.title}
                </p>
              )}
            </SectionCard>
          </aside>
        )}
      </div>

      <div className="today-two-col">
        <div>
          <SectionCard
            title="Daily Hits"
            subtitle={
              activeTemplate
                ? activeTemplate.name
                : "No default daily template found."
            }
          >
            {(!items || items.length === 0) && (
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                No daily items yet. Configure them on the Daily Hits page.
              </p>
            )}
            <ul className="rs-daily-hit-list">
              {items.map((it) => (
                <li key={it.id} className="rs-daily-hit-row">
                  <input
                    type="checkbox"
                    checked={!!completionMap[it.task?.id]}
                    onChange={() => toggleTaskCompletion(it.task?.id)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rs-daily-hit-row__title">
                      {it.task?.title || "Untitled task"}
                    </div>
                    <div className="rs-daily-hit-row__meta">
                      {it.task?.priority || "Priority n/a"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
        <div>
      <SectionCard
        title="Next Actions"
        subtitle="One next action per project, ordered by project priority."
      >
        {projectNextActions.length === 0 && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            No open tasks found. Add tasks on the Action Items page.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          {projectNextActions.map((entry) => {
            const isDone = !!completionMap[entry.task.id];
            return (
              <div
                key={entry.task.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--rs-radius-sm, 8px)",
                  background: isDone
                    ? "rgba(34, 197, 94, 0.06)"
                    : "var(--rs-surface, #f0ede6)",
                  border: isDone
                    ? "1px solid rgba(34, 197, 94, 0.2)"
                    : "1px solid var(--rs-border, #e5e1d8)",
                  opacity: isDone ? 0.7 : 1,
                  transition: "opacity 0.2s, background 0.2s",
                }}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggleTaskCompletion(entry.task.id)}
                  aria-label={`Mark "${entry.task.title}" complete`}
                  style={{ marginTop: 3, flexShrink: 0, width: 18, height: 18, cursor: "pointer" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      textDecoration: isDone ? "line-through" : "none",
                      color: isDone ? "var(--rs-text-muted, #8a8478)" : "var(--rs-text, #3e3a33)",
                    }}
                  >
                    {entry.task.title}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 3,
                      fontSize: 12,
                      color: "var(--rs-text-muted, #8a8478)",
                    }}
                  >
                    <Link
                      href={`/category/${entry.categoryId}`}
                      style={{
                        fontWeight: 600,
                        color: "var(--rs-accent, #b8860b)",
                        textDecoration: "none",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.category}
                    </Link>
                    <span>•</span>
                    <span>{entry.task.priority || "Medium"}</span>
                    {entry.task.effort_hours ? (
                      <>
                        <span>•</span>
                        <span>{entry.task.effort_hours < 1
                          ? `${Math.round(entry.task.effort_hours * 60)}m`
                          : `${entry.task.effort_hours}h`
                        }</span>
                      </>
                    ) : null}
                    {entry.task.parent_task_id && (
                      <>
                        <span>•</span>
                        <span style={{ fontSize: 11, opacity: 0.8 }}>subtask</span>
                      </>
                    )}
                    {entry.task.due_date && (
                      <>
                        <span>•</span>
                        <span style={{
                          color: entry.task.due_date < todayStr ? "var(--rs-danger, #c0392b)" : undefined,
                          fontWeight: entry.task.due_date <= todayStr ? 600 : 400,
                        }}>
                          {entry.task.due_date === todayStr ? "Due today" :
                           entry.task.due_date < todayStr ? "Overdue" :
                           `Due ${entry.task.due_date}`}
                        </span>
                      </>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>
                      {entry.remainingInProject} in project
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Today's Actions — completed tasks summary */}
      <SectionCard
        title="Today's Actions"
        subtitle={`${completedTodayTasks.length} task${completedTodayTasks.length !== 1 ? "s" : ""} completed today`}
      >
        {completedTodayTasks.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--rs-text-muted, #8a8478)", margin: 0 }}>
            No tasks completed yet today. Check off items above to see them here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {completedTodayTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "rgba(34, 197, 94, 0.06)",
                  fontSize: 13,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#22c55e" }}>
                  check_circle
                </span>
                <span style={{ flex: 1, textDecoration: "line-through", color: "var(--rs-text-muted, #8a8478)" }}>
                  {task.title}
                </span>
                {task.category && (
                  <span style={{ fontSize: 11, color: "var(--rs-text-muted, #8a8478)" }}>
                    {task.category}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

        </div>
      </div>
    </DashboardLayout>
  );
}

