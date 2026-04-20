import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import PSShell from "../../components/PSShell";
import ProjectKnowledgeBase from "../../components/ProjectKnowledgeBase";
import ProjectDnaEditor from "../../components/ProjectDnaEditor";
import { useAuth } from "../../hooks/useAuth";
import { HUMAN_NEED_STRATEGY_LABELS } from "../../lib/humanNeedStrategies";

const TYPE_TAG_LABELS = {
  "quick-win": "Quick Win",
  "high-leverage": "High Leverage",
  progress: "Progress",
  maintenance: "Maintenance",
};

function extractTagNames(row) {
  return (row?.tags || [])
    .map((t) => (typeof t === "string" ? t : t?.tag?.name || t?.name || ""))
    .filter(Boolean);
}

function typeTagOf(row) {
  const names = extractTagNames(row);
  for (const t of ["quick-win", "high-leverage", "progress", "maintenance"]) {
    if (names.includes(t)) return t;
  }
  return null;
}
import {
  loadCollaborativeProject,
  saveCollaborativeProjectWorkspace,
} from "../../lib/collaborationClient";
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
  const [breakdowns, setBreakdowns] = useState({});
  const [breakingDown, setBreakingDown] = useState(null);
  const [insertingTask, setInsertingTask] = useState(null);
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [resources, setResources] = useState([]);
  const [mantra, setMantra] = useState("");
  const [projectWorkspace, setProjectWorkspace] = useState(null);
  const [projectOutcomeIds, setProjectOutcomeIds] = useState([]);
  const [projectPrimaryDomain, setProjectPrimaryDomain] = useState(null);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbError, setKbError] = useState("");
  const [editingMantra, setEditingMantra] = useState(false);
  const [mantraDraft, setMantraDraft] = useState("");
  const [mantraSaving, setMantraSaving] = useState(false);
  const [mantraSuggestLoading, setMantraSuggestLoading] = useState(false);
  const [mantraSuggestion, setMantraSuggestion] = useState(null);
  const [mantraError, setMantraError] = useState("");

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
            "id, title, status, priority, effort_hours, due_date, parent_task_id, outcome_ids, primary_life_domain, created_at, updated_at, tags:task_tags(tag:tags(id, name))"
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

      // Load workspace (knowledge base + resources + mantra + DNA)
      try {
        const ws = await loadCollaborativeProject(categoryId);
        setKnowledgeBase(ws?.knowledge_base || "");
        const wsObj = ws?.workspace || {};
        setProjectWorkspace(wsObj);
        setResources(wsObj.resources || []);
        setMantra(wsObj.mantra || "");
        setProjectOutcomeIds(wsObj.outcome_ids || []);
        setProjectPrimaryDomain(wsObj.primary_life_domain || null);
      } catch {
        // silent — shared_project_workspaces row may not exist yet
      }
    } catch (err) {
      setError(err.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [user, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMantra(nextMantra) {
    if (!user || mantraSaving) return;
    setMantraSaving(true);
    setMantraError("");
    try {
      await saveCollaborativeProjectWorkspace(categoryId, {
        workspace: { resources, mantra: nextMantra },
      });
      setMantra(nextMantra);
      setEditingMantra(false);
      setMantraSuggestion(null);
    } catch (err) {
      setMantraError(err.message || "Save failed.");
    } finally {
      setMantraSaving(false);
    }
  }

  async function suggestMantra() {
    if (!user || mantraSuggestLoading) return;
    setMantraSuggestLoading(true);
    setMantraError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/project-mantra", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category_id: categoryId,
          current_mantra: mantra || "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setMantraSuggestion({
        text: data.suggestion || "",
        reason: data.reason || "",
      });
    } catch (err) {
      setMantraError(err.message || "Suggest failed.");
    } finally {
      setMantraSuggestLoading(false);
    }
  }

  async function saveKb() {
    if (!user || kbSaving) return;
    setKbSaving(true);
    setKbError("");
    try {
      await saveCollaborativeProjectWorkspace(categoryId, {
        knowledge_base: knowledgeBase,
        workspace: { resources, mantra },
      });
    } catch (err) {
      setKbError(err.message || "Save failed.");
    } finally {
      setKbSaving(false);
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

  if (!user) return null;

  const coachPayload = {
    project: category?.name || null,
    linked_outcomes: outcomes.map((o) => ({
      title: o.title,
      progress: o.progress,
    })),
    open_task_titles: tasks
      .filter((t) => t.status !== "done")
      .slice(0, 12)
      .map((t) => ({
        title: t.title,
        priority: t.priority,
        minutes: Math.round((t.effort_hours || 0) * 60),
      })),
    done_this_week: doneThisWeek,
  };

  const coachScope = categoryId ? `project:${categoryId}` : "project";

  return (
    <PSShell
      scope={coachScope}
      title={category?.name || "Project"}
      scopeHint={category?.name || "Project view"}
      coachPayload={coachPayload}
      coachPayloadReady={!loading && !!category}
    >
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

              <div className="pj-mantra">
                {editingMantra ? (
                  <>
                    <div className="pj-mantra-cap">
                      Source of truth — what this project is for
                    </div>
                    <textarea
                      className="pj-mantra-input"
                      value={mantraDraft}
                      onChange={(e) => setMantraDraft(e.target.value)}
                      placeholder="One sentence. Concrete and specific. Read this at the top of the page to remember why this project exists."
                      rows={2}
                      autoFocus
                    />
                    <div className="pj-mantra-actions">
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary"
                        onClick={() => saveMantra(mantraDraft.trim())}
                        disabled={mantraSaving}
                      >
                        {mantraSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => {
                          setEditingMantra(false);
                          setMantraDraft(mantra);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={suggestMantra}
                        disabled={mantraSuggestLoading}
                      >
                        {mantraSuggestLoading
                          ? "Coach thinking…"
                          : mantra
                          ? "Coach: refine"
                          : "Coach: draft one"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pj-mantra-cap">Source of truth</div>
                    <div className="pj-mantra-text">
                      {mantra ? (
                        <em>{mantra}</em>
                      ) : (
                        <span className="pj-mantra-empty">
                          No source of truth yet. Write one sentence that
                          captures what this project is FOR.
                        </span>
                      )}
                    </div>
                    <div className="pj-mantra-actions">
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => {
                          setMantraDraft(mantra);
                          setEditingMantra(true);
                        }}
                      >
                        {mantra ? "Edit" : "Write one"}
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={suggestMantra}
                        disabled={mantraSuggestLoading}
                      >
                        {mantraSuggestLoading
                          ? "Coach thinking…"
                          : mantra
                          ? "Coach: suggest an edit"
                          : "Coach: draft one"}
                      </button>
                    </div>
                  </>
                )}

                {mantraError && (
                  <div className="today-error" style={{ marginTop: 8 }}>
                    {mantraError}
                  </div>
                )}

                {mantraSuggestion && (
                  <div className="pj-mantra-suggestion">
                    <div className="pj-mantra-suggestion-cap">
                      Coach proposes
                    </div>
                    <div className="pj-mantra-suggestion-text">
                      {mantraSuggestion.text}
                    </div>
                    {mantraSuggestion.reason && (
                      <div className="pj-mantra-suggestion-reason">
                        {mantraSuggestion.reason}
                      </div>
                    )}
                    <div className="pj-mantra-actions">
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary"
                        onClick={() => {
                          setMantraDraft(mantraSuggestion.text);
                          setEditingMantra(true);
                          setMantraSuggestion(null);
                        }}
                      >
                        Use this
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => setMantraSuggestion(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

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

          <ProjectDnaEditor
            categoryId={categoryId}
            initialOutcomeIds={projectOutcomeIds}
            initialPrimaryLifeDomain={projectPrimaryDomain}
            workspace={projectWorkspace}
            resources={resources}
            onSaved={() => load()}
          />

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
                            {typeTagOf(t) && (
                              <span className="ps-tag pj-tag-type">
                                {TYPE_TAG_LABELS[typeTagOf(t)]}
                              </span>
                            )}
                            {t.primary_life_domain && (
                              <span className="ps-tag pj-tag-need">
                                {HUMAN_NEED_STRATEGY_LABELS[t.primary_life_domain] ||
                                  t.primary_life_domain}
                              </span>
                            )}
                            {(t.outcome_ids || []).length > 0 && (
                              <span className="ps-tag pj-tag-outcome">
                                → outcome
                              </span>
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

          <div className="pj-kb-wrap">
            <div className="pj-kb-head">
              <div>
                <div className="ps-section-title" style={{ margin: 0 }}>
                  Knowledge base &amp; resources
                </div>
                <div className="ps-section-sub">
                  Specs, contacts, reference links. Jarvis reads this as project
                  context.
                </div>
              </div>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={saveKb}
                disabled={kbSaving}
              >
                {kbSaving ? "Saving…" : "Save KB"}
              </button>
            </div>
            {kbError && <div className="today-error">{kbError}</div>}
            <ProjectKnowledgeBase
              knowledgeBase={knowledgeBase}
              onKnowledgeBaseChange={setKnowledgeBase}
              resources={resources}
              onResourcesChange={setResources}
              projectName={category?.name || "Project"}
              mantra={mantra}
              onSave={saveKb}
              saving={kbSaving}
            />
          </div>
        </div>

      <style jsx global>{`
        .pj-kb-wrap {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid var(--ps-ink-10);
        }
        .pj-kb-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .pj-kb-wrap .pkb {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 14px 16px;
        }
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
        .pj-mantra {
          margin-top: 14px;
          padding: 12px 14px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 10px;
        }
        .pj-mantra-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 6px;
        }
        .pj-mantra-text {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.005em;
          line-height: 1.45;
          color: var(--ps-ink);
          margin-bottom: 10px;
        }
        .pj-mantra-empty {
          font-family: var(--ps-sans);
          font-style: normal;
          font-size: 13px;
          color: var(--ps-ink-50);
        }
        .pj-mantra-input {
          width: 100%;
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          padding: 10px 12px;
          border-radius: 8px;
          font-family: var(--ps-serif);
          font-size: 15px;
          line-height: 1.45;
          color: var(--ps-ink);
          resize: vertical;
          min-height: 60px;
          outline: none;
        }
        .pj-mantra-input:focus {
          border-color: var(--ps-accent);
        }
        .pj-mantra-actions {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .pj-mantra-suggestion {
          margin-top: 12px;
          padding: 10px 12px;
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 8px;
        }
        .pj-mantra-suggestion-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
          margin-bottom: 4px;
        }
        .pj-mantra-suggestion-text {
          font-family: var(--ps-serif);
          font-size: 15px;
          letter-spacing: -0.005em;
          line-height: 1.4;
          color: var(--ps-ink);
        }
        .pj-mantra-suggestion-reason {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 4px;
          line-height: 1.5;
        }
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
        .pj-tag-type { background: var(--ps-sage-soft); color: var(--ps-sage); }
        .pj-tag-need { background: var(--ps-indigo-soft); color: var(--ps-indigo); }
        .pj-tag-outcome { background: var(--ps-gold-soft); color: var(--ps-gold); }
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
    </PSShell>
  );
}
