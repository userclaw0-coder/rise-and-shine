import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import DashboardLayout from "../components/DashboardLayout";
import CoachNote from "../components/CoachNote";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import {
  getOrCreateDailyPlan,
  updateDailyPlan,
  getUserProfile,
  setTaskCompletionForDate,
  updateTaskStatusWithEvent,
} from "../lib/db";

const NEEDS = [
  { id: "certainty", label: "Certainty", color: "var(--ps-gold)" },
  { id: "variety", label: "Variety", color: "var(--ps-plum)" },
  { id: "significance", label: "Significance", color: "var(--ps-accent)" },
  { id: "connection", label: "Connection", color: "var(--ps-clay)" },
  { id: "growth", label: "Growth", color: "var(--ps-indigo)" },
  { id: "contribution", label: "Contribution", color: "var(--ps-sage)" },
];

const CATEGORY_COLORS = [
  "var(--ps-clay)",
  "var(--ps-indigo)",
  "var(--ps-plum)",
  "var(--ps-accent)",
  "var(--ps-gold)",
  "var(--ps-sage)",
  "var(--ps-ink)",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function classifyType(task) {
  const effort = Number(task.effort_hours || 0);
  if (task.priority === "High" || task.priority === "Critical") return "leverage";
  if (effort > 0 && effort <= 0.25) return "win";
  return "progress";
}

function inferNeeds(task) {
  const domains = task.life_domains || [];
  const map = {
    growth: "growth",
    business: "significance",
    health: "growth",
    family: "connection",
    home: "certainty",
    adventure: "variety",
    contribution: "contribution",
  };
  const needs = new Set();
  for (const d of domains) if (map[d]) needs.add(map[d]);
  if (needs.size === 0) needs.add("growth");
  return [...needs];
}

export default function TodayPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [queueTasks, setQueueTasks] = useState([]);
  const [perProject, setPerProject] = useState([]);
  const [completed, setCompleted] = useState({});
  const [busyTask, setBusyTask] = useState(null);

  const dateStr = todayStr();

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [planRes, profileRes, categoriesRes] = await Promise.all([
        getOrCreateDailyPlan(user.id, dateStr),
        getUserProfile(user.id),
        supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

      if (planRes.error) throw new Error(planRes.error.message);
      setPlan(planRes.data);

      const categories = categoriesRes.data || [];
      const colorMap = {};
      categories.forEach((c, i) => {
        colorMap[c.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
      });

      const taskIds = (planRes.data?.queue || []).map((s) => s.task_id).filter(Boolean);
      let queueDetails = [];
      if (taskIds.length > 0) {
        const { data: queueRows } = await supabase
          .from("tasks")
          .select(
            "id, title, status, category_id, priority, effort_hours, outcome_ids, primary_life_domain, life_domains"
          )
          .in("id", taskIds);
        const map = new Map((queueRows || []).map((t) => [t.id, t]));
        queueDetails = (planRes.data?.queue || []).map((slot) => ({
          slot: slot.slot,
          type: slot.type,
          task: map.get(slot.task_id) || null,
        }));
      }
      setQueueTasks(queueDetails);

      const { data: activeTasks } = await supabase
        .from("tasks")
        .select(
          "id, title, status, category_id, priority, effort_hours, outcome_ids, primary_life_domain, life_domains, created_at"
        )
        .eq("user_id", user.id)
        .in("status", ["todo", "doing"])
        .is("archived_at", null)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });

      const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const nextByCategory = new Map();
      for (const t of activeTasks || []) {
        if (!t.category_id) continue;
        const existing = nextByCategory.get(t.category_id);
        if (!existing) {
          nextByCategory.set(t.category_id, t);
          continue;
        }
        const a = priorityOrder[existing.priority] ?? 2;
        const b = priorityOrder[t.priority] ?? 2;
        if (b < a) nextByCategory.set(t.category_id, t);
      }

      const projectList = categories
        .map((c) => {
          const task = nextByCategory.get(c.id);
          if (!task) return null;
          return {
            catId: c.id,
            catName: c.name,
            color: colorMap[c.id],
            task,
          };
        })
        .filter(Boolean);
      setPerProject(projectList);

      const { data: events } = await supabase
        .from("task_events")
        .select("task_id, event_type, created_at")
        .eq("user_id", user.id)
        .in("event_type", ["completed", "uncompleted"])
        .gte("created_at", `${dateStr}T00:00:00Z`)
        .lte("created_at", `${dateStr}T23:59:59Z`);
      const byTask = {};
      for (const e of events || []) {
        byTask[e.task_id] = e.event_type === "completed";
      }
      setCompleted(byTask);

      void profileRes;
    } catch (err) {
      setError(err.message || "Failed to load today.");
    } finally {
      setLoading(false);
    }
  }, [user, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleComplete(task) {
    if (!user || !task?.id || busyTask) return;
    setBusyTask(task.id);
    const next = !completed[task.id];
    setCompleted((c) => ({ ...c, [task.id]: next }));
    try {
      await setTaskCompletionForDate(user.id, task.id, dateStr, next);
      if (next) {
        await updateTaskStatusWithEvent(user.id, task.id, "done");
      } else {
        await updateTaskStatusWithEvent(user.id, task.id, "todo");
      }
    } catch {
      setCompleted((c) => ({ ...c, [task.id]: !next }));
    } finally {
      setBusyTask(null);
    }
  }

  async function pinToTop3(task) {
    if (!user || !plan || !task) return;
    const slots = [...(plan.queue || [])];
    if (slots.find((s) => s.task_id === task.id)) return;
    const openSlot = slots.find((s) => !s.task_id) || slots[slots.length - 1];
    const updated = slots.slice();
    if (openSlot) {
      const idx = updated.indexOf(openSlot);
      updated[idx] = {
        slot: openSlot.slot ?? idx + 1,
        type: classifyType(task) === "leverage" ? "High Leverage" : classifyType(task) === "win" ? "Quick Win" : "Progress",
        task_id: task.id,
      };
    } else {
      updated.push({ slot: updated.length + 1, type: "Progress", task_id: task.id });
    }
    setPlan({ ...plan, queue: updated });
    await updateDailyPlan(user.id, plan.id, { queue: updated });
    load();
  }

  const totalChosen = queueTasks.filter((q) => q.task).length;
  const focusMin = queueTasks.reduce((acc, q) => acc + Math.round((q.task?.effort_hours || 0) * 60), 0);

  const needTotals = useMemo(() => {
    const totals = NEEDS.map((n) => ({ ...n, count: 0 }));
    const pool = perProject.map((p) => p.task);
    for (const t of pool) {
      const n = inferNeeds(t);
      for (const id of n) {
        const found = totals.find((x) => x.id === id);
        if (found) found.count += 1;
      }
    }
    const max = Math.max(1, ...totals.map((t) => t.count));
    return totals.map((t) => ({ ...t, pct: Math.round((t.count / max) * 100) }));
  }, [perProject]);

  const niceDate = new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (!user) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>Today · Rise &amp; Shine</title>
      </Head>
      <div className="ps-page">
        <div className="ps-view">
          <div className="ps-eyebrow">{niceDate}</div>
          <h1 className="ps-title">Today</h1>
          <p className="ps-sub">
            Your coach surfaces one next action per active project. Pick your top 3
            for the morning block — the rest stay parked until you&apos;re ready.
          </p>

          {error && <div className="today-error">{error}</div>}

          <div className="today-hero">
            <div>
              <div className="today-hero__eyebrow">Today&apos;s commitment</div>
              <h2 className="today-hero__title">
                {totalChosen === 0
                  ? "Pick 3 next actions to lock in your morning block."
                  : `Top ${totalChosen}, in order — ${queueTasks
                      .filter((q) => q.task)
                      .map((q) => q.task.title)
                      .join(" · ")}`}
              </h2>
              <p className="today-hero__sub">
                {focusMin > 0
                  ? `${focusMin} focused minutes queued.`
                  : "No queue yet. Pick below, or open a project for a deeper plan."}
              </p>
            </div>
            <div className="today-hero__stats">
              <div className="today-hero__stat">
                <div className="today-hero__num">{totalChosen}</div>
                <div className="today-hero__cap">Chosen</div>
              </div>
              <div className="today-hero__stat">
                <div className="today-hero__num">{focusMin}m</div>
                <div className="today-hero__cap">Focus</div>
              </div>
            </div>
          </div>

          <div className="ps-section-title">Next best action per project</div>
          <div className="ps-section-sub">
            {loading
              ? "Loading…"
              : `${perProject.length} projects have a ready next step`}
          </div>

          <div className="today-list">
            {perProject.length === 0 && !loading && (
              <div className="today-empty">
                No active tasks across your projects. Open <Link href="/backlog">Action items</Link> to plan some.
              </div>
            )}
            {perProject.map((p, i) => {
              const chosen = queueTasks.some((q) => q.task?.id === p.task.id);
              const type = classifyType(p.task);
              const needs = inferNeeds(p.task);
              const mins = Math.round((p.task.effort_hours || 0) * 60);
              const done = !!completed[p.task.id];
              return (
                <div
                  key={p.catId}
                  className={"today-action" + (done ? " done" : "")}
                >
                  <button
                    type="button"
                    className={"today-check" + (done ? " checked" : "")}
                    onClick={() => toggleComplete(p.task)}
                    aria-label={done ? "Mark incomplete" : "Mark complete"}
                  >
                    {done ? "✓" : ""}
                  </button>
                  <span className="today-dot" style={{ background: p.color }} />
                  <div className="today-body">
                    <div className="today-proj" style={{ color: p.color }}>
                      <span className="today-idx">0{i + 1}</span>
                      {p.catName}
                    </div>
                    <div className="today-text">{p.task.title}</div>
                    <div className="today-meta">
                      <span className={`ps-tag ps-tag--type-${type}`}>
                        {type === "win"
                          ? "Quick win"
                          : type === "leverage"
                          ? "High leverage"
                          : "Progress"}
                      </span>
                      {needs.map((n) => (
                        <span key={n} className={`ps-tag ps-tag--need-${n}`}>
                          · {n}
                        </span>
                      ))}
                      {p.task.priority && (
                        <span className="ps-tag">p · {p.task.priority}</span>
                      )}
                    </div>
                  </div>
                  <div className="today-actions">
                    {mins > 0 && <div className="today-time">~{mins} min</div>}
                    <button
                      type="button"
                      className={"ps-btn" + (chosen ? " ps-btn--primary" : "")}
                      onClick={() => pinToTop3(p.task)}
                      disabled={chosen}
                    >
                      {chosen ? "★ Top 3" : "Pick"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <CoachNote
            scope="today"
            payload={{
              date: dateStr,
              chosen_titles: queueTasks
                .filter((q) => q.task)
                .map((q) => q.task.title),
              focus_minutes: focusMin,
              candidates: perProject.slice(0, 12).map((p) => ({
                project: p.catName,
                title: p.task.title,
                priority: p.task.priority,
                minutes: Math.round((p.task.effort_hours || 0) * 60),
                done: !!completed[p.task.id],
              })),
              need_balance: needTotals.map((n) => ({
                need: n.id,
                count: n.count,
              })),
            }}
          />

          {needTotals.some((n) => n.count > 0) && (
            <div className="today-ribbon">
              <div className="today-ribbon__head">
                <div>
                  <div className="today-ribbon__title">How today feeds your needs</div>
                  <div className="today-ribbon__sub">
                    If you complete everything above, this is what your day contributes to.
                  </div>
                </div>
                <div className="today-ribbon__cap">Need balance · today</div>
              </div>
              <div className="today-ribbon__grid">
                {needTotals.map((n) => (
                  <div key={n.id} className="today-nb">
                    <div className="today-nb__label" style={{ color: n.color }}>
                      {n.label}
                    </div>
                    <div className="today-nb__val">{n.count}</div>
                    <div className="today-nb__bar">
                      <div
                        className="today-nb__fill"
                        style={{ width: n.pct + "%", background: n.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .today-error {
          margin: 14px 0;
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--ps-clay-soft);
          color: var(--ps-clay);
          font-size: 13px;
          border: 1px solid rgba(184, 92, 62, 0.22);
        }
        .today-hero {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-radius: 16px;
          padding: 24px 26px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 20px;
          align-items: center;
          margin-top: 20px;
        }
        .today-hero__eyebrow {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(250, 247, 242, 0.6);
          margin-bottom: 8px;
        }
        .today-hero__title {
          margin: 0 0 6px;
          font-family: var(--ps-serif);
          font-size: 22px;
          font-weight: 400;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }
        .today-hero__sub { margin: 0; font-size: 13px; color: rgba(250, 247, 242, 0.75); line-height: 1.55; }
        .today-hero__stats { display: flex; gap: 18px; align-items: center; }
        .today-hero__stat { text-align: right; }
        .today-hero__num {
          font-family: var(--ps-serif);
          font-size: 32px;
          letter-spacing: -0.02em;
        }
        .today-hero__cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: rgba(250, 247, 242, 0.6);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .today-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
        .today-empty {
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          padding: 22px;
          border-radius: 12px;
          color: var(--ps-ink-70);
          font-size: 13px;
        }
        .today-empty a { color: var(--ps-accent); }
        .today-action {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 14px 16px;
          display: grid;
          grid-template-columns: 24px auto 1fr auto;
          gap: 14px;
          align-items: start;
          transition: border-color 120ms, box-shadow 120ms, opacity 120ms;
        }
        .today-action:hover { border-color: var(--ps-ink-30); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); }
        .today-action.done { opacity: 0.55; }
        .today-check {
          appearance: none;
          width: 22px;
          height: 22px;
          margin-top: 2px;
          border-radius: 6px;
          border: 1.5px solid var(--ps-ink-30);
          background: #fff;
          cursor: pointer;
          color: var(--ps-bg);
          font-size: 13px;
          line-height: 1;
        }
        .today-check.checked { background: var(--ps-sage); border-color: var(--ps-sage); }
        .today-check:hover { border-color: var(--ps-ink); }
        .today-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          margin-top: 7px;
          flex-shrink: 0;
        }
        .today-body { min-width: 0; }
        .today-proj {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .today-idx {
          font-family: var(--ps-mono);
          font-size: 9px;
          opacity: 0.6;
          margin-right: 6px;
        }
        .today-text {
          font-size: 14px;
          color: var(--ps-ink);
          line-height: 1.45;
          margin-bottom: 8px;
          font-weight: 450;
        }
        .today-meta { display: flex; flex-wrap: wrap; gap: 5px; }
        .today-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-end;
        }
        .today-time {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.05em;
        }
        .today-ribbon {
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
          padding: 18px 20px;
          margin-top: 24px;
        }
        .today-ribbon__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 12px;
          gap: 16px;
        }
        .today-ribbon__title {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .today-ribbon__sub { font-size: 12px; color: var(--ps-ink-60); margin-top: 2px; }
        .today-ribbon__cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .today-ribbon__grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 12px;
        }
        .today-nb { display: flex; flex-direction: column; gap: 6px; }
        .today-nb__label {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .today-nb__val {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
        }
        .today-nb__bar {
          height: 5px;
          background: var(--ps-ink-08);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }
        .today-nb__fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          border-radius: 2px;
        }
        @media (max-width: 880px) {
          .today-hero { grid-template-columns: 1fr; }
          .today-hero__stats { justify-content: flex-start; }
          .today-action { grid-template-columns: 24px auto 1fr; }
          .today-actions { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; }
          .today-ribbon__grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </DashboardLayout>
  );
}
