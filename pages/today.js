import { useEffect, useMemo, useRef, useState } from "react";
import AiPlannerGuidance from "../components/AiPlannerGuidance";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import ProgressToOutcome from "../components/ProgressToOutcome";
import QueueBehaviorHelper from "../components/QueueBehaviorHelper";
import SectionCard from "../components/SectionCard";
import SubtaskOrchestrator from "../components/SubtaskOrchestrator";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import {
  getTemplates,
  getTemplateItems,
  getBacklogTasks,
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
  updateTask,
} from "../lib/db";
import {
  MODES,
  buildRationale,
  chooseKeyOutcomes,
  computeTaskScore,
  getWorkoutPlanForDate,
  getEffectiveCategoryWeights,
} from "../lib/scoring";
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
  const dailyHitsConfettiTriggeredRef = useRef(false);
  const prevQueueLenRef = useRef(0);

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

  const dailyMomentumPct = useMemo(() => {
    const n = items?.length ?? 0;
    if (n <= 0) return 0;
    return Math.round((dailyHitsCompleted / n) * 100);
  }, [items, dailyHitsCompleted]);

  const dailyTemplateTaskIds = useMemo(() => {
    const ids = [];
    for (const it of items || []) {
      if (it.task && it.task.id) ids.push(it.task.id);
    }
    return ids;
  }, [items]);

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

  // Confetti when all Daily Hits are completed
  useEffect(() => {
    const total = items?.length ?? 0;
    if (total <= 0) {
      dailyHitsConfettiTriggeredRef.current = false;
      return;
    }
    if (
      dailyHitsCompleted === total &&
      !dailyHitsConfettiTriggeredRef.current
    ) {
      dailyHitsConfettiTriggeredRef.current = true;
      triggerConfetti();
    } else if (dailyHitsCompleted < total) {
      dailyHitsConfettiTriggeredRef.current = false;
    }
  }, [dailyHitsCompleted, items]);

  // Confetti when Today's 3 Actions queue first reaches 3 tasks
  useEffect(() => {
    const prev = prevQueueLenRef.current;
    const current = Array.isArray(queueEntries) ? queueEntries.length : 0;
    if (prev !== 3 && current === 3) {
      triggerConfetti();
    }
    prevQueueLenRef.current = current;
  }, [queueEntries]);

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

        const wp = getWorkoutPlanForDate(todayStr);
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

        const [tasksRes, lastRes, planRes] = await Promise.all([
          getBacklogTasks(user.id),
          getLastCompletedEventsForUser(user.id),
          getOrCreateDailyPlan(user.id, todayStr, mode),
        ]);

        if (tasksRes.error) {
          setError(tasksRes.error.message);
        } else {
          setBacklogTasks(tasksRes.data || []);
        }

        if (!lastRes.error) {
          setLastCompletedMap(buildLastCompletedMap(lastRes.data || []));
        }

        const plan = planRes.error ? null : planRes.data;
        setDailyPlan(plan);

        const tasks = tasksRes.data || [];
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
    const effectiveTaskId = isWorkoutSynthetic ? workoutTaskId : taskId;
    const value = isWorkoutSynthetic ? { date: taskId.replace("workout-", "") } : null;
    if (!effectiveTaskId) return;

    const res = await logTaskEvent(user.id, effectiveTaskId, nextType, value);
    if (res.error) return;

    // Keep task status aligned with completion behavior for queue tasks.
    if (!isWorkoutSynthetic) {
      await updateTask(user.id, effectiveTaskId, {
        status: nextType === "completed" ? "archived" : "todo",
      });
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
      const dailyHitsSet = new Set(dailyTemplateTaskIds);
      const dailyHitsDone = new Set(
        events.filter((e) => dailyHitsSet.has(e.task_id)).map((e) => e.task_id)
      ).size;
      const otherDone = new Set(
        events.filter((e) => !dailyHitsSet.has(e.task_id)).map((e) => e.task_id)
      ).size;
      setDailyHitsCompleted(dailyHitsDone);
      setOtherCompletedToday(otherDone);
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
      >
        <div className="rs-momentum" aria-label="Daily hits progress">
          <div className="rs-momentum__row">
            <span className="rs-momentum__label">Daily momentum</span>
            <span className="rs-momentum__pct">{dailyMomentumPct}%</span>
          </div>
          <div className="rs-momentum__track" role="progressbar" aria-valuenow={dailyMomentumPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="rs-momentum__fill" style={{ width: `${dailyMomentumPct}%` }} />
          </div>
          <p className="rs-momentum__meta">
            {(items?.length ?? 0) === 0
              ? "Add rituals on Daily Hits to track morning consistency."
              : `${dailyHitsCompleted} of ${items.length} daily hits complete.`}
          </p>
        </div>
      </PageHeader>

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

      <ProgressToOutcome
        queueEntries={queueEntries}
        completionMap={completionMap}
        dailyHitsTotal={items?.length ?? 0}
        dailyHitsCompleted={dailyHitsCompleted}
        otherCompletedToday={otherCompletedToday}
      />

      <QueueBehaviorHelper />

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

          {workoutPlan && (
            <SectionCard
              title="Workout"
              subtitle={
                workoutTaskId
                  ? `Cycle: ${workoutPlan.phase}`
                  : "Workout tracking unavailable. Add a Daily Repeat category (e.g. in Backlog) to enable."
              }
            >
              {workoutTaskId ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!completionMap[workoutPlan.id]}
                    onChange={() => toggleTaskCompletion(workoutPlan.id)}
                  />
                  <div>
                    <div style={{ fontSize: 14 }}>{workoutPlan.title}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      Tap when you complete today&apos;s workout.
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                  {workoutPlan.title}
                </p>
              )}
            </SectionCard>
          )}
        </div>
        <div>
      <SectionCard
        title="Next 3 Actions"
        subtitle={
          dailyPlan != null ? (
            <>
              Finish all 3 to unlock your next set · Refilled{" "}
              {dailyPlan.refilled_count ?? 0} time(s) today.
              <span style={{ display: "block", marginTop: 4, fontWeight: 500 }}>
                Queue stays the same until all 3 are done or you tap Refresh.
              </span>
            </>
          ) : (
            "Load or create your daily plan to see the queue."
          )
        }
      >
        {queueEntries.length === 0 && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            No tasks available for the queue. Add tasks on the Action Items page, then
            refresh the queue here.
          </p>
        )}
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 14 }}>
          {queueEntries.map((entry, idx) => (
            <li key={entry.task.id} style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!completionMap[entry.task.id]}
                  onChange={() => toggleTaskCompletion(entry.task.id)}
                  aria-label={`Mark "${entry.task.title}" complete`}
                  style={{ marginTop: 4, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{entry.task.title}</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {entry.slotType || `#${idx + 1}`} • Priority{" "}
                        {entry.task.priority || "n/a"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--rs-on-surface)",
                          marginTop: 4,
                          padding: "8px 10px",
                          background: "rgba(245, 206, 83, 0.12)",
                          borderRadius: "var(--rs-radius-sm)",
                          borderLeft: "3px solid var(--rs-accent-gold)",
                          lineHeight: 1.45,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "var(--rs-primary-strong)" }}>
                          Why now:
                        </span>{" "}
                        {displayReasonByTaskId.get(entry.task.id) || "Top-scored task for your current focus"}
                      </div>
                      {(() => {
                        const hint = getNextActionHint(entry.task.id, queueEntries, completionMap);
                        if (!hint) return null;
                        const s = HINT_STYLES[hint.style] || HINT_STYLES.done;
                        return (
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              marginTop: 4,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: s.background,
                              color: s.color,
                              border: `1px solid ${s.border}`,
                              display: "inline-block",
                            }}
                          >
                            {hint.text}
                          </div>
                        );
                      })()}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      #{idx + 1}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard
        title="AI Planner"
        subtitle="Suggestions stay optional and approval-based. Nothing is applied automatically."
      >
        <AiPlannerGuidance
          aiLoading={aiLoading}
          aiError={aiError}
          aiStatus={aiStatus}
          aiSuggestions={aiSuggestions}
          queueReady={queueEntries.length === 3}
          appliedMessage={appliedMessage}
          appliedSuccessVisible={appliedSuccessVisible}
          appliedDetails={appliedDetails}
          nextActionLabel={nextActionLabel}
          isMorningFirstBlock={isMorningFirstBlock}
          isLateMorningExecution={isLateMorningExecution}
          isAfterLunchExecution={isAfterLunchExecution}
          isLateAfternoonExecution={isLateAfternoonExecution}
        />
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="rs-btn-primary"
            onClick={handleRefineWithAi}
            disabled={aiLoading || queueEntries.length !== 3}
            style={{
              fontSize: 13,
              cursor: aiLoading || queueEntries.length !== 3 ? "not-allowed" : "pointer",
            }}
          >
            {aiLoading ? "Refining…" : "Refine these 3 with AI"}
          </button>
          {queueEntries.length !== 3 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--rs-on-surface-variant)" }}>
              Queue must have 3 tasks to refine.
            </span>
          )}
        </div>
        {appliedMessage && appliedMessage.toLowerCase().includes("failed") && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 10px", fontWeight: 500 }}>
            {appliedMessage}
          </p>
        )}
        {aiCached && aiSuggestions && (
          <p style={{ fontSize: 12, color: "#059669", margin: "0 0 10px" }}>
            AI suggestions loaded from cache
          </p>
        )}
        {aiError && !String(aiStatus || "").startsWith("fallback:") && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 10px" }}>
            {aiError}
          </p>
        )}
        {aiSuggestions && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {aiSuggestions.task_refinements && aiSuggestions.task_refinements.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", color: "#374151" }}>
                  Task refinements
                </h3>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
                  Approve updates the task title, tags, or effort in place for that one task only. Dismiss or ignore leaves both the task and the rest of your plan unchanged.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(aiSuggestions.task_refinements || []).map((item, idx) => (
                    <div
                      key={`ref-${item.task_id}-${idx}`}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <strong>Title:</strong> {item.suggested_title ?? "—"}
                      </div>
                      {item.why_this_task_now && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#059669",
                            marginBottom: 6,
                            padding: "4px 8px",
                            background: "#f0fdf4",
                            borderRadius: 6,
                            borderLeft: "3px solid #86efac",
                          }}
                        >
                          <strong>Why now:</strong> {item.why_this_task_now}
                        </div>
                      )}
                      {(item.suggested_tags_add?.length > 0) && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                          Tags to add: {item.suggested_tags_add.join(", ")}
                        </div>
                      )}
                      {item.suggested_effort_minutes != null && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                          Effort: {item.suggested_effort_minutes} min
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleApproveRefinement(item, idx)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #059669",
                            background: "#ecfdf5",
                            color: "#059669",
                            cursor: "pointer",
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissRefinement(idx, item)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            color: "#6b7280",
                            cursor: "pointer",
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiSuggestions.suggested_subtasks_to_create && aiSuggestions.suggested_subtasks_to_create.length > 0 && (
              <SubtaskOrchestrator
                subtasks={aiSuggestions.suggested_subtasks_to_create}
                parentTitleById={taskTitleById}
                onApply={handleApplyOrchestrated}
                onDismissAll={handleDismissAllSubtasks}
                applying={subtaskApplying}
                applyError={subtaskApplyError}
              />
            )}
            {aiSuggestions.automation_opportunities && aiSuggestions.automation_opportunities.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
                  Automation opportunities
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(aiSuggestions.automation_opportunities || []).map((item, idx) => (
                    <div
                      key={`auto-${idx}`}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                        {item.title ?? "Automation"}
                      </div>
                      {item.what_it_does && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                          {item.what_it_does}
                        </div>
                      )}
                      {item.benefit && (
                        <div style={{ fontSize: 12, color: "#059669", marginBottom: 4 }}>
                          Benefit: {item.benefit}
                        </div>
                      )}
                      {(item.recommended_tooling?.length > 0) && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                          Tools: {item.recommended_tooling.join(", ")}
                        </div>
                      )}
                      {(item.permissions_needed?.length > 0) && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                          Permissions: {item.permissions_needed.join(", ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleExploreAutomation(idx)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #2563eb",
                            background: "#eff6ff",
                            color: "#2563eb",
                            cursor: "pointer",
                          }}
                        >
                          Explore automation
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissAutomation(idx)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            color: "#6b7280",
                            cursor: "pointer",
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiSuggestions &&
              ((aiSuggestions.task_refinements?.length || 0) +
                (aiSuggestions.suggested_subtasks_to_create?.length || 0) +
                (aiSuggestions.automation_opportunities?.length || 0)) === 0 ? (
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                  Nothing new to review this time. That means the planner completed, found no worthwhile changes, and kept your tasks exactly as they were.
                </p>
              ) : (
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "8px 0 0" }}>
                  You can dismiss everything safely — that only hides suggestions. Your tasks and queue only change when you approve.
                </p>
              )}
          </div>
        )}
      </SectionCard>
        </div>
      </div>
    </DashboardLayout>
  );
}

