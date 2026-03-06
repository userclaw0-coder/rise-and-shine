import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../hooks/useAuth";
import {
  getTemplates,
  getTemplateItems,
  getBacklogTasks,
  getTaskEventsForTasksOnDate,
  getLastCompletedEventsForUser,
  logTaskEvent,
  getOrCreateWorkoutTaskId,
  getOrCreateDailyPlan,
  updateDailyPlan,
  createTask,
  setTaskTags,
  getUserProfile,
} from "../lib/db";
import {
  MODES,
  chooseKeyOutcomes,
  computeTaskScore,
  getWorkoutPlanForDate,
} from "../lib/scoring";

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

/** Build queue payload for daily_plans from chosen outcomes (slot/type/task_id). */
function buildQueueFromChosen(chosen) {
  const types = ["Quick Win", "High Leverage", "Progress"];
  return (chosen || []).slice(0, 3).map((entry, idx) => ({
    slot: idx + 1,
    type: types[idx] || "Progress",
    task_id: entry.task.id,
  }));
}

function normalizeTag(tag) {
  if (!tag) return "";
  return String(tag).trim().toLowerCase().replace(/\s+/g, "-");
}

function hasBlockedOrWaitingTag(task) {
  const tags = (task?.tags || [])
    .map((t) => {
      if (!t) return "";
      if (typeof t === "string") return normalizeTag(t);
      if (t.name) return normalizeTag(t.name);
      if (t.tag?.name) return normalizeTag(t.tag.name);
      return "";
    })
    .filter(Boolean);
  const set = new Set(tags);
  return set.has("blocked") || set.has("waiting");
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

  const [dailyPlan, setDailyPlan] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [isRefilling, setIsRefilling] = useState(false);

  const [workoutPlan, setWorkoutPlan] = useState(null);
  const [workoutTaskId, setWorkoutTaskId] = useState(null);

  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiCached, setAiCached] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState("");

  const [profilePrefs, setProfilePrefs] = useState(null);

  const todayStr = useMemo(() => getTodayDateStr(), []);

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
        const dailySet = new Set(
          (loadedItems || []).map((it) => it.task?.id).filter(Boolean)
        );
        const candidates = tasks.filter((t) => {
          const catName =
            typeof t.category === "string"
              ? t.category
              : t.category?.name ?? null;
          if (catName === "Daily Repeat") return false;
          if (dailySet.has(t.id)) return false;
          if (hasBlockedOrWaitingTag(t)) return false;
          return t.status === "todo" || t.status === "doing";
        });
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
            baseCategoryWeights: profilePrefs?.base_category_weights,
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
  const queueTaskIds = useMemo(
    () => queueEntries.map((e) => e.task_id || e.task?.id).filter(Boolean),
    [queueEntries]
  );
  const queueTaskIdsKey = useMemo(() => queueTaskIds.join(","), [queueTaskIds]);
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
    const dailySet = new Set(dailyTemplateTaskIds);
    const candidates = (backlogTasks || []).filter((t) => {
      const catName = typeof t.category === "string" ? t.category : t.category?.name ?? null;
      if (catName === "Daily Repeat") return false;
      if (dailySet.has(t.id)) return false;
      if (hasBlockedOrWaitingTag(t)) return false;
      return t.status === "todo" || t.status === "doing";
    });
    if (candidates.length === 0) {
      setQueueEntries([]);
      return;
    }
    setIsRefilling(true);
    const chosen = chooseKeyOutcomes(candidates, {
      mode,
      todayStr,
      lastCompletedMap,
      baseCategoryWeights: profilePrefs?.base_category_weights,
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
    if (!res.error) {
      const nextCompletionMap = { ...completionMap, [taskId]: !isCompleted };
      setCompletionMap(nextCompletionMap);
      if (
        !isCompleted &&
        queueTaskIds.length === 3 &&
        queueTaskIds.includes(taskId) &&
        queueTaskIds.every((id) => !!nextCompletionMap[id])
      ) {
        await refillQueue();
      }
    }
  }

  function handleRefreshQueue() {
    refillQueue();
  }

  async function handleRefineWithAi() {
    if (!user || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    setAiSuggestions(null);
    try {
      const res = await fetch("/api/planner/ai-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, date: todayStr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || (data.raw ? "AI returned non-JSON output. Try again." : "AI suggestions unavailable. Please try again.");
        setAiError(msg);
        setAiSuggestions(null);
        return;
      }
      const ai = data.ai;
      if (!ai || typeof ai !== "object") {
        setAiError("AI suggestions unavailable. Please try again.");
        setAiSuggestions(null);
        return;
      }
      setAiCached(!!data.cached);
      setAiSuggestions({
        task_refinements: Array.isArray(ai.task_refinements) ? ai.task_refinements : [],
        suggested_subtasks_to_create: Array.isArray(ai.suggested_subtasks_to_create) ? ai.suggested_subtasks_to_create : [],
        automation_opportunities: Array.isArray(ai.automation_opportunities) ? ai.automation_opportunities : [],
      });
    } catch {
      setAiError("AI suggestions unavailable. Please try again.");
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
    const payload = {
      user_id: user.id,
      task_id: item.task_id,
      suggested_title: item.suggested_title,
      suggested_tags_add: item.suggested_tags_add,
      suggested_effort_minutes: item.suggested_effort_minutes,
    };

    await logRefinementEvent("accept", item);

    try {
      const res = await fetch("/api/planner/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Failed to apply refinement.");
        return;
      }

      const taskUpdate = data.task || {};
      const tagNames = Array.isArray(data.tags) ? data.tags : null;

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

      setAppliedMessage("Applied.");
      setTimeout(() => setAppliedMessage(""), 2000);
      dismissRefinement(index, null);
    } catch {
      setError("Failed to apply refinement.");
    }
  }

  function dismissSubtask(index) {
    setAiSuggestions((prev) => ({
      ...prev,
      suggested_subtasks_to_create: (prev?.suggested_subtasks_to_create || []).filter((_, i) => i !== index),
    }));
  }

  async function handleCreateSubtask(item, index) {
    if (!user) return;
    const title = item.title || "New subtask";
    const effortHours = item.estimated_minutes != null ? item.estimated_minutes / 60 : null;
    const res = await createTask(user.id, {
      title,
      parent_task_id: item.parent_task_id,
      status: "todo",
      effort_hours: effortHours ?? undefined,
    });
    if (res.error) {
      setError(res.error.message || "Failed to create subtask");
      return;
    }
    const tagNames = Array.isArray(item.tags) ? item.tags : [];
    if (tagNames.length > 0 && res.data?.id) {
      const tagRes = await setTaskTags(user.id, res.data.id, tagNames);
      if (tagRes?.error) {
        setError(tagRes.error.message || "Subtask created but tags could not be applied.");
        return;
      }
    }
    dismissSubtask(index);
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
      const c = scoring.components || {};
      const bits = [];
      if (c.isQuickWin) bits.push("quick win");
      if (c.isHighLeverage) bits.push("high leverage");
      if ((c.priorityScore || 0) >= 40) bits.push(`priority ${task.priority || "high"}`);
      if ((c.categoryComponent || 0) > 16) bits.push("strong category fit");
      reasons.set(task.id, bits.length > 0 ? bits.join(" • ") : "best available fit");
    }
    return reasons;
  }, [
    queueEntries,
    mode,
    lastCompletedMap,
    profilePrefs?.base_category_weights,
    profilePrefs?.quick_win_definition_minutes,
  ]);

  // Show loading when: still checking auth, no user (redirecting), or data loading
  if (isCheckingAuth || !user || loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div
        className="today-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Today
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            {todayStr}
          </p>
        </div>
        <div
          className="today-header-controls"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              fontSize: 13,
              color: "#4b5563",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{
                fontSize: 13,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#ffffff",
              }}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleRefreshQueue}
            disabled={isRefilling}
            style={{
              fontSize: 13,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              cursor: isRefilling ? "wait" : "pointer",
            }}
          >
            {isRefilling ? "Refilling…" : "Refresh queue"}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <SectionCard
        title="Next 3 Actions"
        subtitle={
          dailyPlan != null
            ? `Queue does not refill until all 3 are completed. Refilled ${dailyPlan.refilled_count ?? 0} time(s) today.`
            : "Load or create your daily plan to see the queue."
        }
      >
        {queueEntries.length === 0 && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            No candidates found. Add some non-daily backlog tasks first, or refresh the queue.
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
                          fontSize: 11,
                          color: "#9ca3af",
                          marginTop: 2,
                        }}
                      >
                        Why chosen: {queueReasonByTaskId.get(entry.task.id) || "best available fit"}
                      </div>
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
        subtitle="Suggestions require your approval. Nothing is applied automatically."
      >
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleRefineWithAi}
            disabled={aiLoading || queueEntries.length !== 3}
            style={{
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              cursor: aiLoading || queueEntries.length !== 3 ? "not-allowed" : "pointer",
              opacity: aiLoading || queueEntries.length !== 3 ? 0.7 : 1,
            }}
          >
            {aiLoading ? "Refining…" : "Refine these 3 with AI"}
          </button>
          {queueEntries.length !== 3 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
              Queue must have 3 tasks to refine.
            </span>
          )}
        </div>
        {appliedMessage && (
          <p style={{ fontSize: 13, color: "#059669", margin: "0 0 10px", fontWeight: 500 }}>
            {appliedMessage}
          </p>
        )}
        {aiCached && aiSuggestions && (
          <p style={{ fontSize: 12, color: "#059669", margin: "0 0 10px" }}>
            AI suggestions loaded from cache
          </p>
        )}
        {aiError && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 10px" }}>
            {aiError}
          </p>
        )}
        {aiSuggestions && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {aiSuggestions.task_refinements && aiSuggestions.task_refinements.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
                  Task refinements
                </h3>
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
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
                  Suggested subtasks
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(aiSuggestions.suggested_subtasks_to_create || []).map((item, idx) => (
                    <div
                      key={`sub-${item.parent_task_id}-${idx}`}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                        Parent: {taskTitleById.get(item.parent_task_id) ?? item.parent_task_id}
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <strong>{item.title ?? "Untitled subtask"}</strong>
                      </div>
                      {item.estimated_minutes != null && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                          Estimated: {item.estimated_minutes} min
                        </div>
                      )}
                      {(item.tags?.length > 0) && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                          Tags: {item.tags.join(", ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleCreateSubtask(item, idx)}
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
                          Create subtask
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissSubtask(idx)}
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
                  No suggestions this time. Try refining again later.
                </p>
              ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Daily template"
        subtitle={
          activeTemplate
            ? activeTemplate.name
            : "No default daily template found."
        }
      >
        {(!items || items.length === 0) && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            No daily items yet. Configure them on the Templates page.
          </p>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((it) => (
            <li
              key={it.id}
              style={{
                padding: "6px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <input
                type="checkbox"
                checked={!!completionMap[it.task?.id]}
                onChange={() => toggleTaskCompletion(it.task?.id)}
              />
              <div>
                <div style={{ fontSize: 14 }}>
                  {it.task?.title || "Untitled task"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
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
    </DashboardLayout>
  );
}

