import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DashboardLayout from "../components/DashboardLayout";
import {
  getTemplates,
  getTemplateItems,
  getBacklogTasks,
  getTaskEventsForTasksOnDate,
  getLastCompletedEventsForUser,
  logTaskEvent,
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

function buildCompletionMap(events) {
  const byTask = {};
  for (const ev of events || []) {
    byTask[ev.task_id] = ev.event_type === "completed";
  }
  return byTask;
}

function buildLastCompletedMap(events) {
  const map = {};
  for (const ev of events || []) {
    map[ev.task_id] = ev.created_at;
  }
  return map;
}

const LOCAL_PLAN_KEY_PREFIX = "rs-daily-plan-";

function readStoredPlan(dateStr, mode) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      `${LOCAL_PLAN_KEY_PREFIX}${dateStr}`
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.mode !== mode || !Array.isArray(parsed.taskIds)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPlan(dateStr, mode, taskIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${LOCAL_PLAN_KEY_PREFIX}${dateStr}`,
      JSON.stringify({ mode, taskIds })
    );
  } catch {
    // ignore
  }
}

function clearStoredPlan(dateStr) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${LOCAL_PLAN_KEY_PREFIX}${dateStr}`);
  } catch {
    // ignore
  }
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section
      style={{
        marginBottom: 20,
        padding: 16,
        background: "#ffffff",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function OutcomeExplanation({ breakdown }) {
  if (!breakdown) return null;
  const rows = [
    ["Category (base + mode)", `${breakdown.baseCategory} + ${breakdown.modeAdjustment} → ${breakdown.categoryComponent}`],
    ["Priority", `${breakdown.priorityWeight} → ${breakdown.priorityComponent}`],
    ["Quick win", breakdown.quickWinComponent || 0],
    ["High leverage", breakdown.highLeverageComponent || 0],
    ["Due soon", breakdown.dueBoost || 0],
    ["Staleness", breakdown.stalenessComponent || 0],
    ["Subtask bonus", breakdown.subtaskComponent || 0],
  ];
  return (
    <dl
      style={{
        marginTop: 6,
        fontSize: 12,
        color: "#6b7280",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        rowGap: 2,
        columnGap: 12,
      }}
    >
      {rows.map(([label, value]) => (
        <FragmentRow key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

function FragmentRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </>
  );
}

export default function TodayPage() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("Strategic Push");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [items, setItems] = useState([]);
  const [completionMap, setCompletionMap] = useState({});

  const [backlogTasks, setBacklogTasks] = useState([]);
  const [lastCompletedMap, setLastCompletedMap] = useState({});

  const [keyOutcomes, setKeyOutcomes] = useState([]);
  const [isComputingOutcomes, setIsComputingOutcomes] = useState(false);

  const [workoutPlan, setWorkoutPlan] = useState(null);

  const [refreshToken, setRefreshToken] = useState(0);

  const todayStr = useMemo(() => getTodayDateStr(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      if (!u) window.location.href = "/login";
      setUser(u);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      if (!u) window.location.href = "/login";
      setUser(u);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

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
        const allIds = [...itemTaskIds, ...(wp ? [wp.id] : [])];

        if (user && allIds.length > 0) {
          const evRes = await getTaskEventsForTasksOnDate(
            user.id,
            allIds,
            todayStr
          );
          if (!evRes.error) {
            setCompletionMap(buildCompletionMap(evRes.data || []));
          }
        } else {
          setCompletionMap({});
        }

        const [tasksRes, lastRes] = await Promise.all([
          getBacklogTasks(user.id),
          getLastCompletedEventsForUser(user.id),
        ]);

        if (tasksRes.error) {
          setError(tasksRes.error.message);
        } else {
          setBacklogTasks(tasksRes.data || []);
        }

        if (!lastRes.error) {
          setLastCompletedMap(buildLastCompletedMap(lastRes.data || []));
        }
      } catch (e) {
        setError(e.message || "Failed to load today view.");
      } finally {
        setLoading(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, todayStr]);

  useEffect(() => {
    if (!backlogTasks || backlogTasks.length === 0) {
      setKeyOutcomes([]);
      return;
    }
    setIsComputingOutcomes(true);

    const dailySet = new Set(dailyTemplateTaskIds);
    const candidates = backlogTasks.filter((t) => {
      const catName =
        typeof t.category === "string"
          ? t.category
          : t.category && t.category.name
          ? t.category.name
          : null;
      if (catName === "Daily Repeat") return false;
      if (dailySet.has(t.id)) return false;
      return t.status === "todo" || t.status === "doing";
    });

    const stored = readStoredPlan(todayStr, mode);
    let selected;

    if (stored) {
      const byId = new Map(candidates.map((t) => [t.id, t]));
      const picked = [];
      for (const id of stored.taskIds) {
        const task = byId.get(id);
        if (task) picked.push(task);
      }
      if (picked.length === DAILY_KEY_OUTCOMES_COUNT) {
        selected = chooseKeyOutcomes(picked, {
          mode,
          todayStr,
          lastCompletedMap,
        });
      }
    }

    if (!selected) {
      const chosen = chooseKeyOutcomes(candidates, {
        mode,
        todayStr,
        lastCompletedMap,
      });
      selected = chosen;
      writeStoredPlan(
        todayStr,
        mode,
        chosen.map((c) => c.task.id)
      );
    }

    setKeyOutcomes(selected);
    setIsComputingOutcomes(false);
  }, [
    backlogTasks,
    lastCompletedMap,
    mode,
    todayStr,
    dailyTemplateTaskIds,
    refreshToken,
  ]);

  async function toggleTaskCompletion(taskId) {
    if (!user || !taskId) return;
    const isCompleted = !!completionMap[taskId];
    const nextType = isCompleted ? "uncompleted" : "completed";
    const res = await logTaskEvent(user.id, taskId, nextType);
    if (!res.error) {
      setCompletionMap((prev) => ({
        ...prev,
        [taskId]: !isCompleted,
      }));
    }
  }

  function handleRefreshOutcomes() {
    clearStoredPlan(todayStr);
    setRefreshToken((x) => x + 1);
  }

  if (loading && !user) {
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
            onClick={handleRefreshOutcomes}
            style={{
              fontSize: 13,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            Refresh outcomes
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <SectionCard
        title="Key outcomes (3 for today)"
        subtitle={
          isComputingOutcomes
            ? "Computing scores..."
            : "Scored by category, mode, tags, and staleness."
        }
      >
        {keyOutcomes.length === 0 && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            No candidates found. Add some non-daily backlog tasks first.
          </p>
        )}
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 14 }}>
          {keyOutcomes.map((entry, idx) => (
            <li key={entry.task.id} style={{ marginBottom: 10 }}>
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
                    Score: {Math.round(entry.score)} • Priority{" "}
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
              <OutcomeExplanation breakdown={entry.breakdown} />
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
          subtitle={`Cycle: ${workoutPlan.phase}`}
        >
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
        </SectionCard>
      )}
    </DashboardLayout>
  );
}

