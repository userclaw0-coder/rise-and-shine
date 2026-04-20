import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import DashboardLayout from "../../components/DashboardLayout";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import {
  getUserProfile,
  updateTaskStatusWithEvent,
  createTask,
} from "../../lib/db";

const PROJECT_COLORS = [
  "var(--ps-clay)",
  "var(--ps-indigo)",
  "var(--ps-plum)",
  "var(--ps-accent)",
  "var(--ps-gold)",
  "var(--ps-sage)",
  "var(--ps-ink)",
];

function groupTasks(tasks) {
  const active = [];
  const backlog = [];
  const needsBreak = [];
  for (const t of tasks) {
    if (t.status === "done") continue;
    const tooBig = (t.effort_hours || 0) > 0.5;
    const priority = t.priority;
    if (priority === "Critical" || priority === "High") {
      if (tooBig) needsBreak.push(t);
      else active.push(t);
    } else if (tooBig) {
      needsBreak.push(t);
    } else {
      backlog.push(t);
    }
  }
  return [
    { label: "This week — active", items: active },
    { label: "Ordered backlog", items: backlog },
    { label: "Needs breakdown — too big", items: needsBreak, flag: true },
  ].filter((g) => g.items.length > 0);
}

export default function ProjectPage() {
  const router = useRouter();
  const { categoryId } = router.query;
  const { user } = useAuth();
  const [category, setCategory] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [subtasks, setSubtasks] = useState({});
  const [coachOutcomes, setCoachOutcomes] = useState(null);
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const [outcomesError, setOutcomesError] = useState("");
  const [breakdowns, setBreakdowns] = useState({});
  const [breakingDown, setBreakingDown] = useState(null);
  const [insertingTask, setInsertingTask] = useState(null);

  const color = PROJECT_COLORS[categoryIndex % PROJECT_COLORS.length];

  const load = useCallback(async () => {
    if (!user || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, listRes, profileRes, allCatsRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("id", categoryId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("tasks")
          .select(
            "id, title, status, priority, effort_hours, due_date, parent_task_id, outcome_ids, created_at, updated_at"
          )
          .eq("user_id", user.id)
          .eq("category_id", categoryId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
        getUserProfile(user.id),
        supabase
          .from("categories")
          .select("id")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);
      if (catRes.error) throw new Error(catRes.error.message);
      if (!catRes.data) throw new Error("Project not found.");
      if (listRes.error) throw new Error(listRes.error.message);
      setCategory(catRes.data);
      setTasks(listRes.data || []);
      const cats = allCatsRes.data || [];
      const idx = cats.findIndex((c) => c.id === categoryId);
      setCategoryIndex(idx === -1 ? 0 : idx);

      const profile = profileRes?.data?.profile || {};
      const visionOutcomes = profile.desired_outcomes || [];
      const linked = new Set();
      for (const t of listRes.data || []) {
        for (const id of t.outcome_ids || []) linked.add(id);
      }
      const relevant = visionOutcomes.filter((o) => linked.has(o.id));
      const withProgress = relevant.map((o) => {
        const subset = (listRes.data || []).filter((t) =>
          (t.outcome_ids || []).includes(o.id)
        );
        const done = subset.filter((t) => t.status === "done").length;
        const progress = subset.length > 0 ? done / subset.length : 0;
        return { ...o, progress, taskCount: subset.length };
      });
      setOutcomes(withProgress);
    } catch (err) {
      setError(err.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [user, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function fetchOutcomes() {
    if (!user || outcomesLoading || !categoryId) return;
    setOutcomesLoading(true);
    setOutcomesError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/project-outcomes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ category_id: categoryId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setCoachOutcomes(data.outcomes || []);
    } catch (err) {
      setOutcomesError(err.message || "Failed to fetch outcomes.");
    } finally {
      setOutcomesLoading(false);
    }
  }

  async function fetchBreakdown(task) {
    if (!user || breakingDown) return;
    setBreakingDown(task.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/task-breakdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ task_id: task.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setBreakdowns((b) => ({ ...b, [task.id]: data.subtasks || [] }));
    } catch (err) {
      setBreakdowns((b) => ({ ...b, [task.id]: { error: err.message || "Failed" } }));
    } finally {
      setBreakingDown(null);
    }
  }

  async function acceptBreakdownStep(parentTask, step) {
    if (!user || insertingTask) return;
    setInsertingTask(`${parentTask.id}:${step.title}`);
    try {
      await createTask(user.id, {
        title: step.title,
        priority: parentTask.priority || "Medium",
        effort_hours: (step.minutes || 20) / 60,
        category_id: parentTask.category_id || categoryId,
        parent_task_id: parentTask.id,
      });
      load();
      // Remove the inserted step from the breakdown panel
      setBreakdowns((b) => {
        const list = (b[parentTask.id] || []).filter((s) => s.title !== step.title);
        return { ...b, [parentTask.id]: list };
      });
    } finally {
      setInsertingTask(null);
    }
  }

  async function loadSubtasks(taskId) {
    if (subtasks[taskId]) return;
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, effort_hours")
      .eq("user_id", user.id)
      .eq("parent_task_id", taskId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    setSubtasks((s) => ({ ...s, [taskId]: data || [] }));
  }

  async function toggleTask(t) {
    const nextStatus = t.status === "done" ? "todo" : "done";
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x))
    );
    await updateTaskStatusWithEvent(user.id, t.id, nextStatus);
  }

  const groups = useMemo(() => groupTasks(tasks), [tasks]);
  const overall = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "done");
    if (active.length === 0 && tasks.length === 0) return 0;
    return Math.round(
      (tasks.filter((t) => t.status === "done").length / Math.max(1, tasks.length)) *
        100
    );
  }, [tasks]);

  const doneThisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return tasks.filter(
      (t) =>
        t.status === "done" &&
        t.updated_at &&
        new Date(t.updated_at) > cutoff
    ).length;
  }, [tasks]);

  const lastTouched = useMemo(() => {
    if (tasks.length === 0) return null;
    const max = tasks.reduce((a, t) => {
      const ts = t.updated_at ? new Date(t.updated_at).getTime() : 0;
      return ts > a ? ts : a;
    }, 0);
    if (!max) return null;
    const days = Math.round((Date.now() - max) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }, [tasks]);

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
        <title>{category ? `${category.name} · Rise & Shine` : "Project"}</title>
      </Head>
      <div className="ps-page">
        <div className="ps-view">
          <div className="ps-eyebrow pj-breadcrumb">
            <Link href="/projects">Projects</Link>
            <span className="pj-sep">/</span>
            <span className="pj-current">{category?.name || "…"}</span>
          </div>

          {error && <div className="today-error">{error}</div>}

          <div className="pj-hero">
            <div className="pj-hero-body">
              <div className="pj-hero-eyebrow">
                <span className="pj-dot" style={{ background: color }} />
                <span>Active project</span>
              </div>
              <h1 className="ps-title">{category?.name || "Project"}</h1>
              <div className="pj-meta">
                <div>
                  <strong>{outcomes.length}</strong> linked outcome
                  {outcomes.length === 1 ? "" : "s"}
                </div>
                <div>
                  <strong>{tasks.filter((t) => t.status !== "done").length}</strong>{" "}
                  open tasks
                </div>
                <div>
                  <strong>{doneThisWeek}</strong> done this week
                </div>
                {lastTouched && (
                  <div>
                    Last touched <strong>{lastTouched}</strong>
                  </div>
                )}
              </div>
            </div>
            <div className="pj-progress">
              <div className="pj-progress-num">
                {overall}
                <span>%</span>
              </div>
              <div className="pj-progress-cap">All tasks complete</div>
              <div className="pj-progress-bar">
                <div
                  className="pj-progress-fill"
                  style={{ width: overall + "%", background: color }}
                />
              </div>
            </div>
          </div>

          {outcomes.length > 0 && (
            <>
              <div className="ps-section-title">Outcomes this project serves</div>
              <div className="ps-section-sub">
                Each outcome is a 90-day bet. Tasks ladder up to exactly one.
              </div>
              <div className="pj-outcomes">
                {outcomes.map((o) => (
                  <div key={o.id} className="pj-outcome-card">
                    <div className="pj-outcome-cap" style={{ color }}>
                      Outcome
                    </div>
                    <div className="pj-outcome-label">{o.title}</div>
                    <div className="pj-progress-bar" style={{ marginTop: 14 }}>
                      <div
                        className="pj-progress-fill"
                        style={{
                          width: Math.round(o.progress * 100) + "%",
                          background: color,
                        }}
                      />
                    </div>
                    <div className="pj-outcome-foot">
                      <span>{Math.round(o.progress * 100)}%</span>
                      <span>
                        {o.taskCount} task{o.taskCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="pj-coach-card">
            <div className="pj-coach-head">
              <div>
                <div className="pj-coach-cap">Coach · 90-day outcomes proposal</div>
                <div className="pj-coach-title">
                  Let the coach propose outcomes for {category?.name || "this project"}
                </div>
                <div className="pj-coach-sub">
                  Anchored to your vision and what&apos;s actually moving in this project.
                </div>
              </div>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={fetchOutcomes}
                disabled={outcomesLoading}
              >
                {outcomesLoading ? "Thinking…" : coachOutcomes ? "Re-propose" : "Propose 3 outcomes"}
              </button>
            </div>
            {outcomesError && (
              <div className="today-error" style={{ marginTop: 10 }}>
                {outcomesError}
              </div>
            )}
            {coachOutcomes && coachOutcomes.length > 0 && (
              <div className="pj-coach-outcomes">
                {coachOutcomes.map((o, i) => (
                  <div key={i} className="pj-coach-outcome">
                    <div className="pj-coach-outcome-text">{o.text}</div>
                    <div className="pj-coach-outcome-reason">{o.reason}</div>
                    <div className="pj-coach-outcome-foot">
                      <span
                        className="ps-tag"
                        style={{
                          background:
                            o.confidence === "high"
                              ? "var(--ps-sage-soft)"
                              : o.confidence === "low"
                              ? "var(--ps-clay-soft)"
                              : "var(--ps-gold-soft)",
                          color:
                            o.confidence === "high"
                              ? "var(--ps-sage)"
                              : o.confidence === "low"
                              ? "var(--ps-clay)"
                              : "var(--ps-gold)",
                        }}
                      >
                        {o.confidence || "medium"} confidence
                      </span>
                      <span className="pj-coach-hint">
                        Save outcomes on /vision &rarr; Clarify mode
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pj-ladder">
            <div className="pj-ladder-head">
              <div>
                <div className="pj-ladder-title">Task ladder</div>
                <div className="pj-ladder-sub">
                  Coach-ordered. Anything over 30 min gets flagged for breakdown.
                </div>
              </div>
              <Link href="/backlog" className="ps-btn ps-btn--primary">
                + Add in backlog
              </Link>
            </div>

            {loading && <div className="pj-empty">Loading…</div>}
            {!loading && groups.length === 0 && (
              <div className="pj-empty">
                No active tasks yet. Capture some in{" "}
                <Link href="/backlog">Action items</Link>.
              </div>
            )}

            {groups.map((g) => (
              <div key={g.label} className="pj-group">
                <div className="pj-group-head">
                  <span className="pj-group-label">{g.label}</span>
                  <span className="pj-group-count">{g.items.length}</span>
                </div>
                {g.items.map((t) => {
                  const mins = Math.round((t.effort_hours || 0) * 60);
                  const isOpen = expanded === t.id;
                  const subs = subtasks[t.id] || [];
                  return (
                    <div key={t.id} className="pj-item">
                      <div className="pj-item-row">
                        <button
                          type="button"
                          className={"pj-check" + (t.status === "done" ? " done" : "")}
                          onClick={() => toggleTask(t)}
                          aria-label="Toggle complete"
                        >
                          {t.status === "done" ? "✓" : ""}
                        </button>
                        <div className="pj-item-body">
                          <div
                            className={
                              "pj-item-text" + (t.status === "done" ? " done" : "")
                            }
                          >
                            {t.title}
                          </div>
                          <div className="pj-item-tags">
                            {t.priority && (
                              <span className="ps-tag">{t.priority}</span>
                            )}
                            {g.flag && (
                              <span className="ps-tag pj-tag-flag">⚑ Too big</span>
                            )}
                          </div>
                          {g.flag && (
                            <div className="pj-coach-note">
                              <div className="pj-coach-cap">Coach</div>
                              <p>
                                This one is ~{mins} minutes. Want me to propose
                                ≤30 min sub-steps?
                              </p>
                              {!breakdowns[t.id] && (
                                <button
                                  type="button"
                                  className="ps-btn ps-btn--primary"
                                  style={{ marginTop: 8 }}
                                  onClick={() => fetchBreakdown(t)}
                                  disabled={breakingDown === t.id}
                                >
                                  {breakingDown === t.id ? "Thinking…" : "Break it down"}
                                </button>
                              )}
                              {breakdowns[t.id]?.error && (
                                <div className="today-error" style={{ marginTop: 8 }}>
                                  {breakdowns[t.id].error}
                                </div>
                              )}
                              {Array.isArray(breakdowns[t.id]) && breakdowns[t.id].length > 0 && (
                                <div className="pj-breakdown-list">
                                  {breakdowns[t.id].map((s, i) => (
                                    <div key={i} className="pj-breakdown-row">
                                      <span className="pj-breakdown-mins">
                                        {s.minutes}m
                                      </span>
                                      <span className="pj-breakdown-text">
                                        {s.title}
                                      </span>
                                      <button
                                        type="button"
                                        className="ps-btn"
                                        onClick={() => acceptBreakdownStep(t, s)}
                                        disabled={
                                          insertingTask === `${t.id}:${s.title}`
                                        }
                                      >
                                        {insertingTask === `${t.id}:${s.title}`
                                          ? "…"
                                          : "Accept"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {Array.isArray(breakdowns[t.id]) && breakdowns[t.id].length === 0 && (
                                <div className="pj-breakdown-empty">
                                  All proposed steps accepted.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="pj-item-size">{mins ? `${mins} min` : ""}</div>
                        <button
                          className="pj-item-expand"
                          onClick={() => {
                            const next = isOpen ? null : t.id;
                            setExpanded(next);
                            if (next) loadSubtasks(t.id);
                          }}
                        >
                          {isOpen ? "−" : "+"}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="pj-subtasks">
                          {subs.length === 0 ? (
                            <div className="pj-empty-sub">No subtasks yet.</div>
                          ) : (
                            subs.map((s) => (
                              <div key={s.id} className="pj-sub">
                                <span
                                  className={
                                    "pj-check pj-check-sm" +
                                    (s.status === "done" ? " done" : "")
                                  }
                                >
                                  {s.status === "done" ? "✓" : ""}
                                </span>
                                <span className="pj-sub-text">{s.title}</span>
                                {s.effort_hours > 0 && (
                                  <span className="pj-sub-mins">
                                    {Math.round(s.effort_hours * 60)}m
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .pj-breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pj-breadcrumb a {
          color: inherit;
          text-decoration: none;
        }
        .pj-breadcrumb a:hover { color: var(--ps-ink); }
        .pj-sep { color: var(--ps-ink-30); }
        .pj-current { color: var(--ps-ink); }
        .pj-hero {
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-10);
          border-radius: 16px;
          padding: 22px 24px;
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 260px;
          gap: 24px;
          align-items: center;
        }
        .pj-hero-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          margin-bottom: 4px;
        }
        .pj-dot { width: 10px; height: 10px; border-radius: 3px; }
        .pj-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 10px;
        }
        .pj-meta strong { color: var(--ps-ink); font-weight: 600; }
        .pj-progress {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .pj-progress-num {
          font-family: var(--ps-serif);
          font-size: 36px;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--ps-ink);
        }
        .pj-progress-num span {
          font-size: 18px;
          color: var(--ps-ink-50);
          margin-left: 2px;
        }
        .pj-progress-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin: 4px 0 10px;
        }
        .pj-progress-bar {
          height: 6px;
          background: var(--ps-ink-08);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .pj-progress-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          border-radius: 3px;
          transition: width 300ms;
        }
        .pj-outcomes {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 12px;
        }
        .pj-outcome-card {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .pj-outcome-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .pj-outcome-label {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
          line-height: 1.3;
        }
        .pj-outcome-foot {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }

        .pj-coach-card {
          margin-top: 24px;
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 14px;
          padding: 18px 20px;
        }
        .pj-coach-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .pj-coach-card .pj-coach-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .pj-coach-title {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
          margin-top: 4px;
        }
        .pj-coach-sub {
          font-size: 12px;
          color: var(--ps-ink-70);
          margin-top: 4px;
        }
        .pj-coach-outcomes {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 10px;
        }
        .pj-coach-outcome {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pj-coach-outcome-text {
          font-family: var(--ps-serif);
          font-size: 14px;
          letter-spacing: -0.01em;
          line-height: 1.35;
          color: var(--ps-ink);
        }
        .pj-coach-outcome-reason {
          font-size: 12px;
          color: var(--ps-ink-70);
          line-height: 1.5;
        }
        .pj-coach-outcome-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .pj-coach-hint {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.04em;
          color: var(--ps-ink-50);
        }
        .pj-breakdown-list {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pj-breakdown-row {
          display: grid;
          grid-template-columns: 36px 1fr auto;
          gap: 8px;
          align-items: center;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 6px;
          padding: 6px 10px;
        }
        .pj-breakdown-mins {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-accent);
          font-weight: 600;
        }
        .pj-breakdown-text {
          font-size: 12.5px;
          color: var(--ps-ink-80);
          line-height: 1.4;
        }
        .pj-breakdown-empty {
          margin-top: 8px;
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
        }
        .pj-ladder {
          margin-top: 32px;
        }
        .pj-ladder-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--ps-ink-10);
          margin-bottom: 14px;
        }
        .pj-ladder-title {
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
        }
        .pj-ladder-sub {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 2px;
        }
        .pj-empty {
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          border-radius: 12px;
          padding: 30px;
          text-align: center;
          color: var(--ps-ink-60);
          font-size: 13px;
        }
        .pj-group {
          margin-bottom: 20px;
        }
        .pj-group-head {
          display: flex;
          align-items: baseline;
          gap: 10px;
          padding: 6px 0;
          margin-bottom: 6px;
        }
        .pj-group-label {
          font-family: var(--ps-serif);
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .pj-group-count {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .pj-item {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          margin-bottom: 6px;
        }
        .pj-item-row {
          display: grid;
          grid-template-columns: 22px 1fr auto 24px;
          gap: 12px;
          padding: 10px 14px;
          align-items: start;
        }
        .pj-check {
          appearance: none;
          width: 20px;
          height: 20px;
          margin-top: 2px;
          border-radius: 5px;
          border: 1.5px solid var(--ps-ink-30);
          background: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--ps-bg);
          font-size: 12px;
          line-height: 1;
        }
        .pj-check.done {
          background: var(--ps-sage);
          border-color: var(--ps-sage);
        }
        .pj-check-sm {
          width: 16px;
          height: 16px;
          font-size: 10px;
          border-width: 1px;
        }
        .pj-item-body { min-width: 0; }
        .pj-item-text {
          font-size: 13.5px;
          color: var(--ps-ink);
          line-height: 1.4;
        }
        .pj-item-text.done {
          text-decoration: line-through;
          color: var(--ps-ink-50);
        }
        .pj-item-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 4px;
        }
        .pj-tag-flag { background: var(--ps-accent-soft); color: var(--ps-accent); }
        .pj-item-size {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
          white-space: nowrap;
          margin-top: 2px;
        }
        .pj-item-expand {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: transparent;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          cursor: pointer;
          color: var(--ps-ink-60);
          font-size: 14px;
          line-height: 1;
        }
        .pj-item-expand:hover { border-color: var(--ps-ink); color: var(--ps-ink); }
        .pj-coach-note {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 8px;
        }
        .pj-coach-note p { margin: 4px 0 0; font-size: 12px; color: var(--ps-ink-80); line-height: 1.5; }
        .pj-coach-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .pj-subtasks {
          padding: 4px 14px 12px 46px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pj-sub {
          display: grid;
          grid-template-columns: 16px 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 4px 0;
          font-size: 12.5px;
          color: var(--ps-ink-80);
        }
        .pj-sub-mins {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .pj-empty-sub {
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
          padding: 4px 0;
        }

        @media (max-width: 900px) {
          .pj-hero { grid-template-columns: 1fr; }
          .pj-outcomes { grid-template-columns: 1fr; }
        }
      `}</style>
    </DashboardLayout>
  );
}
