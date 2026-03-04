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
  getDailyPlan,
  updateDailyPlan,
} from "../lib/db";
import {
  MODES,
  DAILY_KEY_OUTCOMES_COUNT,
  chooseKeyOutcomes,
  getWorkoutPlanForDate,
} from "../lib/scoring";

function getTodayDateStr() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
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

  const todayStr = useMemo(() => getTodayDateStr(), []);

  const dailyTemplateTaskIds = useMemo(() => {
    const ids = [];
    for (const it of items || []) {
      if (it.task && it.task.id) ids.push(it.task.id);
    }
    return ids;
  }, [items]);

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

        const needsRefill = plan && resolved.length < 3 && candidates.length > 0;
        if (needsRefill) {
          const chosen = chooseKeyOutcomes(candidates, {
            mode,
            todayStr,
            lastCompletedMap: buildLastCompletedMap(lastRes.data || []),
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
  }, [user, todayStr, mode]);

  // Fetch completion state for queue task IDs so checkboxes reflect DB
  const queueTaskIds = useMemo(
    () => queueEntries.map((e) => e.task_id || e.task?.id).filter(Boolean),
    [queueEntries]
  );
  useEffect(() => {
    if (!user || queueTaskIds.length === 0 || !todayStr) return;
    getTaskEventsForTasksOnDate(user.id, queueTaskIds, todayStr).then((res) => {
      if (res.error) return;
      const map = buildCompletionMap(res.data || [], null);
      setCompletionMap((prev) => ({ ...prev, ...map }));
    });
  }, [user, todayStr, queueTaskIds.join(",")]);

  async function refillQueue() {
    if (!user || !dailyPlan || isRefilling) return;
    const dailySet = new Set(dailyTemplateTaskIds);
    const candidates = (backlogTasks || []).filter((t) => {
      const catName = typeof t.category === "string" ? t.category : t.category?.name ?? null;
      if (catName === "Daily Repeat") return false;
      if (dailySet.has(t.id)) return false;
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
      setCompletionMap((prev) => ({ ...prev, [taskId]: !isCompleted }));
      if (
        !isCompleted &&
        queueTaskIds.length === 3 &&
        queueTaskIds.includes(taskId) &&
        queueTaskIds.every((id) => id === taskId || !!completionMap[id])
      ) {
        await refillQueue();
      }
    }
  }

  function handleRefreshQueue() {
    refillQueue();
  }

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

