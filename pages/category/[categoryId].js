import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import BacklogStrategicTaskCard from "../../components/BacklogStrategicTaskCard";
import DashboardLayout from "../../components/DashboardLayout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { useAuth } from "../../hooks/useAuth";
import {
  createTask,
  getAllTags,
  getBacklogTasks,
  getCategoriesWithSubcategories,
  getUserProfile,
  setTaskTags,
  updateTask,
  upsertUserProfile,
  updateTaskStatusWithEvent,
  ensureSubcategory,
} from "../../lib/db";
import { computeTaskScore } from "../../lib/scoring";
import {
  RESOURCE_KINDS,
  buildProjectContextPack,
  computeProjectAlignment,
  defaultProjectWorkspace,
  mergeProjectWorkspace,
  newResourceRow,
} from "../../lib/projectWorkspace";

const LIFE_DOMAIN_KEYS = ["business", "finances", "health", "relationships", "lifestyle", "growth"];

function lifeDomainLabel(key, profile) {
  if (!key) return "";
  const ld = profile?.life_domains;
  const text = ld && ld[key] ? String(ld[key]).slice(0, 24) : key;
  return text || key;
}

function extractTagNames(task) {
  if (!task || !task.tags) return [];
  const result = [];
  for (const t of task.tags) {
    if (!t) continue;
    if (typeof t === "string") result.push(t);
    else if (t.tag && t.tag.name) result.push(t.tag.name);
    else if (t.name) result.push(t.name);
  }
  return result;
}

function makeTagText(task) {
  return extractTagNames(task).join(", ");
}

function parseTagText(text) {
  return (text || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function StrategicProjectWorkspacePage() {
  const router = useRouter();
  const { categoryId } = router.query;
  const { user, isCheckingAuth } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [tags, setTags] = useState([]);

  const [mantra, setMantra] = useState("");
  const [narrative, setNarrative] = useState("");
  const [efficiencyTip, setEfficiencyTip] = useState("");
  const [suggestedMoves, setSuggestedMoves] = useState([]);
  const [newMoveText, setNewMoveText] = useState("");
  const [resources, setResources] = useState([]);
  const [healthNeeds, setHealthNeeds] = useState(defaultProjectWorkspace().health_needs);
  const [projectLinks, setProjectLinks] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const [orderIds, setOrderIds] = useState([]);

  const [expandedSubtasksByParent, setExpandedSubtasksByParent] = useState({});
  const [expandedTagPillsByTask, setExpandedTagPillsByTask] = useState({});

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskEffortHours, setTaskEffortHours] = useState("");
  const [taskTagsText, setTaskTagsText] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  const load = useCallback(async () => {
    if (!user || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const [catsRes, tasksRes, profileRes] = await Promise.all([
        getCategoriesWithSubcategories(user.id),
        getBacklogTasks(user.id, { includeArchived: false }),
        getUserProfile(user.id),
      ]);

      const cats = catsRes.data || [];
      setCategories(cats);
      const cat = cats.find((c) => String(c.id) === String(categoryId)) || null;
      setCategory(cat);

      const all = tasksRes.data || [];
      const inCat = all.filter((t) => String(t.category_id) === String(categoryId));
      setTasks(
        inCat.map((t) => ({
          ...t,
          _tagsText: makeTagText(t),
          _subcategoryText: t?.subcategory?.name || "",
        }))
      );

      const prof = profileRes?.data?.profile || null;
      setProfile(prof);
      const prefs = prof?.preferences || {};
      const linksMap = prefs.category_project_links || {};
      const legacy = String(linksMap[String(categoryId)] || "");
      setProjectLinks(legacy);

      const ws = mergeProjectWorkspace(prefs, categoryId, legacy);
      setMantra(ws.mantra || "");
      setNarrative(ws.narrative || "");
      setEfficiencyTip(ws.efficiency_tip || "");
      setSuggestedMoves(ws.suggested_moves || []);
      setResources(ws.resources?.length ? ws.resources : []);
      setHealthNeeds({ ...defaultProjectWorkspace().health_needs, ...(ws.health_needs || {}) });

      const orderMap = prefs.category_task_order_ids || {};
      const serverOrder = Array.isArray(orderMap[String(categoryId)]) ? orderMap[String(categoryId)] : [];
      setOrderIds(serverOrder.filter(Boolean));

      getAllTags(user.id).then((tRes) => {
        if (!tRes.error) setTags(tRes.data || []);
      });
    } catch (e) {
      setError(e.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [user, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const childrenByParent = useMemo(() => {
    const m = new Map();
    for (const t of tasks || []) {
      const pid = t.parent_task_id;
      if (!pid) continue;
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid).push(t);
    }
    return m;
  }, [tasks]);

  const rootTasks = useMemo(
    () => (tasks || []).filter((t) => !t.parent_task_id),
    [tasks]
  );

  const pendingRootCount = useMemo(
    () => rootTasks.filter((t) => t.status !== "done" && t.status !== "archived").length,
    [rootTasks]
  );

  const scoredRoots = useMemo(() => {
    return rootTasks.map((t) => {
      const scoring = computeTaskScore(
        { ...t, tags: extractTagNames(t) },
        { mode: profile?.preferences?.default_mode || "Strategic Push" }
      );
      return { ...t, _aiPriorityScore: scoring.score };
    });
  }, [rootTasks, profile?.preferences?.default_mode]);

  const sortedRootTasks = useMemo(() => {
    const byId = new Map(scoredRoots.map((t) => [t.id, t]));
    const inOrder = (orderIds || []).map((id) => byId.get(id)).filter(Boolean);
    const remaining = scoredRoots.filter((t) => !(orderIds || []).includes(t.id));
    let list = [...inOrder, ...remaining];

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "score") cmp = (a._aiPriorityScore ?? 0) - (b._aiPriorityScore ?? 0);
      else if (sortKey === "title") {
        cmp = String(a.title || "").localeCompare(String(b.title || ""), undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "due") {
        const da = a.due_date ? new Date(a.due_date).getTime() : 0;
        const db = b.due_date ? new Date(b.due_date).getTime() : 0;
        cmp = da - db;
      }
      return cmp * dir;
    });
    return sorted;
  }, [scoredRoots, orderIds, sortKey, sortDir]);

  const alignmentPct = useMemo(
    () => computeProjectAlignment(rootTasks, mantra, narrative),
    [rootTasks, mantra, narrative]
  );

  const categoryOptions = useMemo(() => {
    return (categories || [])
      .map((c) => ({ id: c.id, name: c.name }))
      .filter((c) => c.id && c.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  }, [categories]);

  function updateTaskLocal(taskId, patch) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  async function handleStatusChange(task, nextStatus) {
    if (!user) return;
    const res = await updateTaskStatusWithEvent(user.id, task.id, nextStatus);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    updateTaskLocal(task.id, {
      status: nextStatus,
      archived_at: nextStatus === "archived" ? new Date().toISOString() : null,
    });
  }

  async function handleInlineSave(taskId, patch) {
    if (!user) return;
    const res = await updateTask(user.id, taskId, patch);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    updateTaskLocal(taskId, res.data || patch);
  }

  async function handleSubcategorySave(task) {
    if (!user) return;
    const catId = task.category_id || null;
    const name = String(task._subcategoryText || "").trim();
    if (!catId) {
      setError("Select a category before setting a subcategory.");
      return;
    }
    if (!name) {
      await handleInlineSave(task.id, { subcategory_id: null });
      updateTaskLocal(task.id, { subcategory_id: null, subcategory: null, _subcategoryText: "" });
      return;
    }
    const subRes = await ensureSubcategory(user.id, catId, name);
    if (subRes.error) {
      setError(subRes.error.message || "Failed to save subcategory.");
      return;
    }
    if (!subRes.data?.id) return;
    const saveRes = await updateTask(user.id, task.id, { subcategory_id: subRes.data.id });
    if (saveRes.error) {
      setError(saveRes.error.message || "Failed to save subcategory.");
      return;
    }
    updateTaskLocal(task.id, {
      ...(saveRes.data || {}),
      subcategory_id: subRes.data.id,
      subcategory: { name: subRes.data.name },
      _subcategoryText: subRes.data.name,
    });
  }

  async function handleTagsSave(taskId, tagsText) {
    if (!user) return;
    const names = parseTagText(tagsText);
    const res = await setTaskTags(user.id, taskId, names);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    updateTaskLocal(taskId, {
      _tagsText: tagsText,
      tags: names.map((name) => ({ name })),
    });
  }

  async function handleAddSubtask(parent) {
    if (!user) return;
    const title = `Subtask of ${parent.title}`;
    const res = await createTask(user.id, {
      title,
      status: "todo",
      parent_task_id: parent.id,
      category_id: parent.category_id || null,
      subcategory_id: parent.subcategory_id || null,
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const created = {
      ...res.data,
      _tagsText: "",
      _subcategoryText: parent?.subcategory?.name || "",
    };
    setTasks((prev) => [...prev, created]);
  }

  async function persistFullWorkspace() {
    if (!user || !categoryId) return;
    setSavingWorkspace(true);
    setError("");
    try {
      const res = await getUserProfile(user.id);
      const existing = res?.data?.profile || {};
      const prefs = { ...(existing.preferences || {}) };
      const id = String(categoryId);
      const prevWs = prefs.project_workspaces?.[id] || {};
      prefs.project_workspaces = {
        ...(prefs.project_workspaces || {}),
        [id]: {
          ...defaultProjectWorkspace(),
          ...prevWs,
          mantra: mantra.trim(),
          narrative: narrative.trim(),
          efficiency_tip: efficiencyTip.trim(),
          suggested_moves: suggestedMoves.filter((s) => String(s).trim()),
          resources: resources.filter((r) => r.url?.trim() || r.label?.trim()),
          health_needs: { ...healthNeeds },
        },
      };
      const linkMap = { ...(prefs.category_project_links || {}) };
      linkMap[id] = String(projectLinks || "");
      prefs.category_project_links = linkMap;

      const up = await upsertUserProfile(user.id, { ...existing, preferences: prefs });
      if (up.error) setError(up.error.message || "Failed to save.");
      else setProfile((p) => ({ ...(p || {}), preferences: prefs }));
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function copyContextPack() {
    const pack = buildProjectContextPack({
      categoryName: category?.name,
      mantra,
      narrative,
      profile,
      rootTasks: sortedRootTasks,
      healthNeeds,
      resources,
      efficiencyTip,
      suggestedMoves,
      legacyLinksText: projectLinks,
    });
    try {
      await navigator.clipboard.writeText(pack);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  function openCreateTaskModal() {
    setTaskTitle("");
    setTaskPriority("Medium");
    setTaskStatus("todo");
    setTaskDueDate("");
    setTaskEffortHours("");
    setTaskTagsText("");
    setTaskModalOpen(true);
  }

  async function handleSaveTask() {
    if (!user || !categoryId) return;
    const title = String(taskTitle || "").trim();
    if (!title) return;

    setSavingTask(true);
    setError("");
    try {
      const updates = {
        title,
        priority: taskPriority || "Medium",
        status: taskStatus || "todo",
        due_date: taskDueDate ? taskDueDate : null,
        effort_hours: taskEffortHours ? Number(taskEffortHours) : null,
        category_id: categoryId,
      };

      const res = await createTask(user.id, updates);
      if (res.error) {
        setError(res.error.message || "Failed to create task.");
        return;
      }
      const newTaskId = res.data?.id;
      if (newTaskId) {
        const tagNames = parseTagText(taskTagsText);
        await setTaskTags(user.id, newTaskId, tagNames);
        setOrderIds((prev) => (prev.includes(newTaskId) ? prev : [...prev, newTaskId]));
      }

      await load();
      setTaskModalOpen(false);
    } finally {
      setSavingTask(false);
    }
  }

  function addSuggestedMove() {
    const t = newMoveText.trim();
    if (!t) return;
    setSuggestedMoves((m) => [...m, t]);
    setNewMoveText("");
  }

  function removeSuggestedMove(idx) {
    setSuggestedMoves((m) => m.filter((_, i) => i !== idx));
  }

  function addResource() {
    setResources((r) => [...r, newResourceRow()]);
  }

  function patchResource(id, patch) {
    setResources((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function removeResource(id) {
    setResources((r) => r.filter((x) => x.id !== id));
  }

  if (isCheckingAuth || !user || loading || !router.isReady) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "var(--rs-on-surface-variant)" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  if (!category && categoryId) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "var(--rs-on-surface-variant)" }}>Category not found.</p>
        <Link href="/backlog" className="rs-btn-ghost" style={{ marginTop: 12, display: "inline-block" }}>
          ← Action Items
        </Link>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="rs-project-workspace">
        <PageHeader
          eyebrow="Strategic project workspace"
          title={category?.name || "Project"}
          subtitle="Source of truth, resources, and AI context — with Action Items scoped to this initiative."
          right={
            <div className="rs-project-workspace__header-actions">
              <select
                className="rs-select-compact"
                value={String(categoryId || "")}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) router.push(`/category/${id}`);
                }}
                aria-label="Switch project"
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Link href="/backlog" className="rs-btn-ghost" style={{ textDecoration: "none" }}>
                Action Items
              </Link>
              <button type="button" className="rs-btn-primary" onClick={openCreateTaskModal}>
                New initiative
              </button>
            </div>
          }
        />

        {error && <p className="rs-project-workspace__error">{error}</p>}

        {/* Hero: mantra + narrative + alignment */}
        <section className="rs-project-hero rs-section-card">
          <div className="rs-project-hero__grid">
            <div className="rs-project-hero__main">
              <p className="rs-page-eyebrow" style={{ marginBottom: 8 }}>
                Active mantra
              </p>
              <input
                type="text"
                className="rs-input rs-project-mantra-input"
                value={mantra}
                onChange={(e) => setMantra(e.target.value)}
                placeholder="One line that captures why this project exists (e.g. dignified transition for parents)."
              />
              <label className="rs-project-narrative-label">
                <span>Strategic source of truth</span>
                <textarea
                  className="rs-input rs-project-narrative"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  rows={5}
                  placeholder="Long-form context for you and your AI: constraints, stakeholders, non-negotiables, timeline, how this ties to vision and outcomes."
                />
              </label>
              <div className="rs-project-hero__save-row">
                <button
                  type="button"
                  className="rs-btn-primary"
                  onClick={persistFullWorkspace}
                  disabled={savingWorkspace}
                >
                  {savingWorkspace ? "Saving…" : "Save strategic brief"}
                </button>
                <span className="rs-project-hero__hint">
                  Saves mantra, narrative, AI notes, resources, health sliders, and legacy link block.
                </span>
              </div>
            </div>
            <div className="rs-project-alignment-card">
              <div className="rs-project-alignment-card__value">{alignmentPct}%</div>
              <div className="rs-project-alignment-card__label">Alignment</div>
              <p className="rs-project-alignment-card__sub">
                Heuristic from narrative depth, task progress, and outcome links — tune the story and finish work to
                raise it.
              </p>
            </div>
          </div>
        </section>

        <div className="rs-project-workspace__grid">
          <div className="rs-project-workspace__main-col">
            <section className="rs-section-card">
              <div className="rs-project-section-head">
                <div>
                  <h2 className="rs-section-card__title" style={{ marginBottom: 4 }}>
                    Action items
                  </h2>
                  <p className="rs-section-card__subtitle" style={{ margin: 0 }}>
                    {pendingRootCount} pending root initiative{pendingRootCount === 1 ? "" : "s"} · strategic priority
                    from scoring model
                  </p>
                </div>
                <div className="rs-project-sort">
                  <label>
                    Sort
                    <select
                      className="rs-select-compact"
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value)}
                    >
                      <option value="score">Strategic score</option>
                      <option value="due">Due date</option>
                      <option value="title">Title</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rs-btn-ghost rs-btn-ghost--small"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  >
                    {sortDir === "desc" ? "High → low" : "Low → high"}
                  </button>
                </div>
              </div>

              {categories.map((c) => (
                <datalist key={c.id} id={`subcategory-options-${c.id}`}>
                  {(c.subcategories || []).map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              ))}

              <div className="rs-backlog-card-list" style={{ marginTop: 16 }}>
                {sortedRootTasks.length === 0 ? (
                  <p className="rs-section-card__subtitle">No initiatives in this project yet.</p>
                ) : (
                  sortedRootTasks.map((t) => {
                    const kids = (childrenByParent.get(t.id) || []).slice().sort((a, b) =>
                      String(a.title || "").localeCompare(String(b.title || ""), undefined, {
                        sensitivity: "base",
                      })
                    );
                    return (
                      <div key={t.id}>
                        <BacklogStrategicTaskCard
                          task={t}
                          sortedChildren={kids}
                          categories={categories}
                          profile={profile}
                          lifeDomainLabel={lifeDomainLabel}
                          LIFE_DOMAIN_KEYS={LIFE_DOMAIN_KEYS}
                          expandedSubtasks={!!expandedSubtasksByParent[t.id]}
                          onToggleSubtasksExpanded={() =>
                            setExpandedSubtasksByParent((p) => ({ ...p, [t.id]: !p[t.id] }))
                          }
                          expandedTagPills={!!expandedTagPillsByTask[t.id]}
                          onToggleTagPills={() =>
                            setExpandedTagPillsByTask((p) => ({ ...p, [t.id]: !p[t.id] }))
                          }
                          updateTaskLocal={updateTaskLocal}
                          handleInlineSave={handleInlineSave}
                          handleStatusChange={handleStatusChange}
                          handleSubcategorySave={handleSubcategorySave}
                          handleTagsSave={handleTagsSave}
                          handleAddSubtask={handleAddSubtask}
                          tagText={t._tagsText ?? makeTagText(t)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <aside className="rs-project-workspace__aside">
            <section className="rs-section-card rs-project-ai-card">
              <div className="rs-project-ai-card__head">
                <h2 className="rs-section-card__title" style={{ margin: 0, fontSize: "1rem" }}>
                  AI strategic window
                </h2>
                <span className="material-symbols-outlined rs-project-ai-card__icon" aria-hidden>
                  auto_awesome
                </span>
              </div>
              <p className="rs-section-card__subtitle" style={{ marginBottom: 10 }}>
                Paste suggestions from any model, or draft your own. Copy the context pack for a project-scoped thread.
              </p>
              <label className="rs-project-field-label">Efficiency / batching tip</label>
              <textarea
                className="rs-input"
                rows={3}
                value={efficiencyTip}
                onChange={(e) => setEfficiencyTip(e.target.value)}
                placeholder="e.g. Batch estate notarization to save travel time next week."
              />
              <label className="rs-project-field-label" style={{ marginTop: 12 }}>
                Suggested moves &amp; subtask ideas
              </label>
              <ul className="rs-project-suggest-list">
                {suggestedMoves.map((line, idx) => (
                  <li key={idx}>
                    <span className="material-symbols-outlined" aria-hidden>
                      arrow_forward
                    </span>
                    <span>{line}</span>
                    <button
                      type="button"
                      className="rs-project-icon-btn"
                      onClick={() => removeSuggestedMove(idx)}
                      aria-label="Remove"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="rs-project-add-row">
                <input
                  type="text"
                  className="rs-input"
                  value={newMoveText}
                  onChange={(e) => setNewMoveText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSuggestedMove())}
                  placeholder="Add a line from your AI planner…"
                />
                <button type="button" className="rs-btn-ghost" onClick={addSuggestedMove}>
                  Add
                </button>
              </div>
              <div className="rs-project-ai-actions">
                <button type="button" className="rs-btn-primary" onClick={copyContextPack}>
                  {copyFlash ? "Copied" : "Copy context for AI"}
                </button>
                <button type="button" className="rs-btn-ghost" onClick={persistFullWorkspace} disabled={savingWorkspace}>
                  Save AI notes
                </button>
              </div>
            </section>

            <section className="rs-section-card rs-project-health-card">
              <div className="rs-project-health-card__head">
                <span className="material-symbols-outlined" aria-hidden>
                  favorite
                </span>
                <h2 className="rs-section-card__title" style={{ margin: 0, fontSize: "1rem" }}>
                  Project health
                </h2>
              </div>
              <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
                How this initiative currently feels across core needs (self-reported).
              </p>
              {[
                ["relationships", "Loving relationships / care"],
                ["financial", "Financial stability"],
                ["wellbeing", "Security & wellbeing"],
                ["growth", "Growth & meaning"],
              ].map(([key, label]) => (
                <div key={key} className="rs-project-health-row">
                  <div className="rs-project-health-row__label">
                    <span>{label}</span>
                    <span>{healthNeeds[key] ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={healthNeeds[key] ?? 50}
                    onChange={(e) =>
                      setHealthNeeds((h) => ({ ...h, [key]: Number(e.target.value) }))
                    }
                    className="rs-project-range"
                  />
                </div>
              ))}
              <button
                type="button"
                className="rs-btn-ghost"
                style={{ marginTop: 8 }}
                onClick={persistFullWorkspace}
                disabled={savingWorkspace}
              >
                Save health
              </button>
            </section>

            <section className="rs-section-card rs-project-vault-card">
              <h2 className="rs-section-card__title" style={{ fontSize: "1rem", marginBottom: 4 }}>
                Resource vault
              </h2>
              <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
                Drive folders, docs, dedicated AI projects, archives.
              </p>

              {resources.length === 0 && (
                <p className="rs-section-card__subtitle" style={{ fontSize: 12 }}>
                  No structured links yet — add rows below or paste bulk links in the legacy block.
                </p>
              )}

              <div className="rs-project-resource-list">
                {resources.map((r) => (
                  <div key={r.id} className="rs-project-resource-row">
                    <input
                      type="text"
                      className="rs-input"
                      placeholder="Label"
                      value={r.label}
                      onChange={(e) => patchResource(r.id, { label: e.target.value })}
                    />
                    <input
                      type="url"
                      className="rs-input"
                      placeholder="https://…"
                      value={r.url}
                      onChange={(e) => patchResource(r.id, { url: e.target.value })}
                    />
                    <select
                      className="rs-select-compact"
                      value={r.kind || "folder"}
                      onChange={(e) => patchResource(r.id, { kind: e.target.value })}
                    >
                      {RESOURCE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rs-project-icon-btn"
                      onClick={() => removeResource(r.id)}
                      aria-label="Remove resource"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="rs-btn-ghost rs-project-add-resource" onClick={addResource}>
                <span className="material-symbols-outlined">add</span>
                Add resource
              </button>

              <label className="rs-project-field-label" style={{ marginTop: 16 }}>
                Legacy link dump (also saved)
              </label>
              <textarea
                className="rs-input"
                rows={4}
                value={projectLinks}
                onChange={(e) => setProjectLinks(e.target.value)}
                placeholder="Paste any extra URLs or notes — we’ll include them in the AI context pack when structured rows are empty."
              />
              <button
                type="button"
                className="rs-btn-primary"
                style={{ marginTop: 10 }}
                onClick={persistFullWorkspace}
                disabled={savingWorkspace}
              >
                Save vault
              </button>
            </section>

            <section className="rs-section-card rs-project-tips">
              <h3 className="rs-section-card__title" style={{ fontSize: "0.95rem" }}>
                Ideas to increase value
              </h3>
              <ul className="rs-project-tips__list">
                <li>Run Action Items → AI enrichment on tasks, then copy winning subtasks here.</li>
                <li>Re-copy the context pack after big edits so external AI threads stay current.</li>
                <li>Link each initiative to an outcome for clearer cross-project prioritization.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>

      <Modal
        title="New initiative"
        open={taskModalOpen}
        onClose={() => !savingTask && setTaskModalOpen(false)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="rs-project-field-label">
            Title
            <input
              type="text"
              className="rs-input"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </label>
          <div className="rs-form-grid-2">
            <label className="rs-project-field-label">
              Priority
              <select
                className="rs-input"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
              >
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
            <label className="rs-project-field-label">
              Status
              <select className="rs-input" value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
                <option value="todo">todo</option>
                <option value="doing">doing</option>
                <option value="done">done</option>
                <option value="archived">archived</option>
              </select>
            </label>
          </div>
          <div className="rs-form-grid-2">
            <label className="rs-project-field-label">
              Due
              <input type="date" className="rs-input" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
            </label>
            <label className="rs-project-field-label">
              Effort (hrs)
              <input
                type="number"
                step="0.25"
                className="rs-input"
                value={taskEffortHours}
                onChange={(e) => setTaskEffortHours(e.target.value)}
              />
            </label>
          </div>
          <label className="rs-project-field-label">
            Tags (comma separated)
            <input
              type="text"
              className="rs-input"
              value={taskTagsText}
              onChange={(e) => setTaskTagsText(e.target.value)}
              placeholder={tags?.length ? tags.slice(0, 5).map((t) => t.name).join(", ") : ""}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="rs-btn-ghost" onClick={() => setTaskModalOpen(false)} disabled={savingTask}>
              Cancel
            </button>
            <button
              type="button"
              className="rs-btn-primary"
              onClick={handleSaveTask}
              disabled={savingTask || !taskTitle.trim()}
            >
              {savingTask ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
