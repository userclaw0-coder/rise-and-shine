import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import BacklogStrategicTaskCard from "../../components/BacklogStrategicTaskCard";
import DashboardLayout from "../../components/DashboardLayout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import {
  getAllTags,
} from "../../lib/db";
import {
  addCollaborativeProjectMember,
  assignCollaborativeTask,
  createCollaborativeTask,
  ensureCollaborativeSubcategory,
  listCollaborativeProjectMembers,
  loadCollaborativeProject,
  removeCollaborativeProjectMember,
  saveCollaborativeProjectWorkspace,
  setCollaborativeTaskTags,
  updateCollaborativeProjectMember,
  updateCollaborativeTask,
  updateCollaborativeTaskStatus,
} from "../../lib/collaborationClient";
import { computeTaskScore } from "../../lib/scoring";
import {
  RESOURCE_KINDS,
  buildProjectExportBundle,
  buildProjectContextPack,
  computeProjectAlignment,
  defaultProjectWorkspace,
  newResourceRow,
} from "../../lib/projectWorkspace";
import {
  flattenExternalProjectImportActions,
  groupExternalProjectImportActions,
} from "../../lib/externalProjectImport";
import {
  HUMAN_NEED_STRATEGY_KEYS as LIFE_DOMAIN_KEYS,
  getHumanNeedStrategyLabel,
} from "../../lib/humanNeedStrategies";

function AutoHeightTextarea({ value, onChange, rows = 2, className, placeholder, disabled = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 24 * rows)}px`;
  }, [value, rows]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        resize: "none",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    />
  );
}

function lifeDomainLabel(key, profile) {
  return getHumanNeedStrategyLabel(key);
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
  const [copyFlashKey, setCopyFlashKey] = useState("");
  const [aiProvider, setAiProvider] = useState("claude");
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importApplying, setImportApplying] = useState(false);
  const [importError, setImportError] = useState("");
  const [importRun, setImportRun] = useState(null);
  const [selectedImportActionIds, setSelectedImportActionIds] = useState([]);
  const [recentImports, setRecentImports] = useState([]);

  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [taskStatusScope, setTaskStatusScope] = useState("open");
  const [taskViewMode, setTaskViewMode] = useState("full");
  const [expandedSimpleCards, setExpandedSimpleCards] = useState({});

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
  const [members, setMembers] = useState([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [sharingMember, setSharingMember] = useState(false);

  const load = useCallback(async () => {
    if (!user || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const data = await loadCollaborativeProject(categoryId);
      const cats = data.categories || [];
      setCategories(cats);
      const cat = data.category || cats.find((c) => String(c.id) === String(categoryId)) || null;
      setCategory(cat);
      const inCat = data.tasks || [];
      setTasks(
        inCat.map((t) => ({
          ...t,
          _tagsText: makeTagText(t),
          _subcategoryText: t?.subcategory?.name || "",
        }))
      );
      setMembers(data.members || []);
      const prof = data.profile || null;
      setProfile(prof);
      const legacy = String(data.legacy_links || "");
      setProjectLinks(legacy);
      const ws = {
        ...defaultProjectWorkspace(),
        ...(data.workspace || {}),
      };
      setMantra(ws.mantra || "");
      setNarrative(ws.narrative || "");
      setEfficiencyTip(ws.efficiency_tip || "");
      setSuggestedMoves(ws.suggested_moves || []);
      setResources(ws.resources?.length ? ws.resources : []);
      setHealthNeeds({ ...defaultProjectWorkspace().health_needs, ...(ws.health_needs || {}) });
      setOrderIds((data.task_order_ids || []).filter(Boolean));

      getAllTags(user.id).then((tRes) => {
        if (!tRes.error) setTags(tRes.data || []);
      });
      setRecentImports(data.recent_imports || []);
    } catch (e) {
      setError(e.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [user, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedScope = window.localStorage.getItem("project-workspace-task-scope");
      const storedView = window.localStorage.getItem("project-workspace-task-view");
      if (storedScope === "open" || storedScope === "all") setTaskStatusScope(storedScope);
      if (storedView === "full" || storedView === "simplified") setTaskViewMode(storedView);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("project-workspace-task-scope", taskStatusScope);
      window.localStorage.setItem("project-workspace-task-view", taskViewMode);
    } catch {
      // ignore storage errors
    }
  }, [taskStatusScope, taskViewMode]);

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

  function taskMatchesScope(task) {
    if (!task) return false;
    if (taskStatusScope === "open") {
      return task.status === "todo" || task.status === "doing";
    }
    return true;
  }

  const scoredRoots = useMemo(() => {
    return rootTasks.map((t) => {
      const scoring = computeTaskScore(
        { ...t, tags: extractTagNames(t) },
        { mode: profile?.preferences?.default_mode || "Strategic Push" }
      );
      return { ...t, _aiPriorityScore: scoring.score };
    });
  }, [rootTasks, profile?.preferences?.default_mode]);

  const visibleScoredRoots = useMemo(
    () => scoredRoots.filter(taskMatchesScope),
    [scoredRoots, taskStatusScope]
  );

  const sortedRootTasks = useMemo(() => {
    const byId = new Map(visibleScoredRoots.map((t) => [t.id, t]));
    const inOrder = (orderIds || []).map((id) => byId.get(id)).filter(Boolean);
    const remaining = visibleScoredRoots.filter((t) => !(orderIds || []).includes(t.id));
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
  }, [visibleScoredRoots, orderIds, sortKey, sortDir]);

  const alignmentPct = useMemo(
    () => computeProjectAlignment(rootTasks, mantra, narrative),
    [rootTasks, mantra, narrative]
  );

  const exportBundle = useMemo(
    () =>
      buildProjectExportBundle(
        {
          categoryId,
          categoryName: category?.name,
          mantra,
          narrative,
          profile,
          rootTasks: tasks,
          healthNeeds,
          resources,
          efficiencyTip,
          suggestedMoves,
          legacyLinksText: projectLinks,
        },
        { provider: aiProvider }
      ),
    [
      aiProvider,
      category?.name,
      categoryId,
      efficiencyTip,
      healthNeeds,
      mantra,
      narrative,
      profile,
      projectLinks,
      resources,
      suggestedMoves,
      tasks,
    ]
  );

  const importGroups = useMemo(
    () => groupExternalProjectImportActions(importRun?.normalized_json || null, categoryId),
    [categoryId, importRun]
  );

  const importActionIds = useMemo(
    () =>
      flattenExternalProjectImportActions(importRun?.normalized_json || null, categoryId)
        .map((item) => item.id)
        .filter(Boolean),
    [categoryId, importRun]
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

  const canEditProject = !!category?._access?.can_edit;
  const canManageMembers = !!category?._access?.can_manage_members;

  async function handleStatusChange(task, nextStatus) {
    if (!user) return;
    try {
      const res = await updateCollaborativeTaskStatus(task.id, nextStatus);
      updateTaskLocal(task.id, {
        ...(res.task || {}),
        status: nextStatus,
        archived_at: nextStatus === "archived" ? new Date().toISOString() : null,
      });
    } catch (e) {
      setError(e.message);
      return;
    }
  }

  async function handleInlineSave(taskId, patch) {
    if (!user) return;
    try {
      const res = await updateCollaborativeTask(taskId, patch);
      updateTaskLocal(taskId, res.task || patch);
    } catch (e) {
      setError(e.message);
      return;
    }
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
    let subcategory = null;
    try {
      const subRes = await ensureCollaborativeSubcategory(catId, name);
      subcategory = subRes.subcategory || null;
    } catch (e) {
      setError(e.message || "Failed to save subcategory.");
      return;
    }
    if (!subcategory?.id) return;
    try {
      const saveRes = await updateCollaborativeTask(task.id, { subcategory_id: subcategory.id });
      updateTaskLocal(task.id, {
        ...(saveRes.task || {}),
        subcategory_id: subcategory.id,
        subcategory: { name: subcategory.name },
        _subcategoryText: subcategory.name,
      });
    } catch (e) {
      setError(e.message || "Failed to save subcategory.");
      return;
    }
  }

  async function handleTagsSave(taskId, tagsText) {
    if (!user) return;
    const names = parseTagText(tagsText);
    try {
      await setCollaborativeTaskTags(taskId, names);
      updateTaskLocal(taskId, {
        _tagsText: tagsText,
        tags: names.map((name) => ({ name })),
      });
    } catch (e) {
      setError(e.message);
      return;
    }
  }

  async function handleAddSubtask(parent) {
    if (!user) return;
    const title = `Subtask of ${parent.title}`;
    let createdTask = null;
    try {
      const res = await createCollaborativeTask({
        title,
        status: "todo",
        parent_task_id: parent.id,
        category_id: parent.category_id || null,
        subcategory_id: parent.subcategory_id || null,
      });
      createdTask = res.task || null;
    } catch (e) {
      setError(e.message);
      return;
    }
    const created = {
      ...createdTask,
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
      await saveCollaborativeProjectWorkspace(categoryId, {
        mantra: mantra.trim(),
        narrative: narrative.trim(),
        efficiency_tip: efficiencyTip.trim(),
        suggested_moves: suggestedMoves.filter((s) => String(s).trim()),
        resources: resources.filter((r) => r.url?.trim() || r.label?.trim()),
        health_needs: { ...healthNeeds },
        legacy_links: String(projectLinks || ""),
        task_order_ids: orderIds,
      });
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleAssignTask(task, assigneeUserId) {
    if (!user || !task?.id) return;
    try {
      const res = await assignCollaborativeTask(task.id, assigneeUserId);
      updateTaskLocal(task.id, { assignees: res.assignees || [] });
    } catch (e) {
      setError(e.message || "Failed to assign task.");
    }
  }

  async function handleAddMember() {
    if (!user || !categoryId || !shareEmail.trim()) return;
    setSharingMember(true);
    setError("");
    try {
      const res = await addCollaborativeProjectMember(categoryId, shareEmail.trim(), shareRole);
      setMembers(res.members || []);
      setShareEmail("");
      await load();
    } catch (e) {
      setError(e.message || "Failed to share project.");
    } finally {
      setSharingMember(false);
    }
  }

  async function handleMemberRoleChange(memberUserId, role) {
    if (!categoryId) return;
    try {
      const res = await updateCollaborativeProjectMember(categoryId, memberUserId, role);
      setMembers(res.members || []);
    } catch (e) {
      setError(e.message || "Failed to update member.");
    }
  }

  async function handleRemoveMember(memberUserId) {
    if (!categoryId) return;
    try {
      const res = await removeCollaborativeProjectMember(categoryId, memberUserId);
      setMembers(res.members || []);
      const freshMembers = await listCollaborativeProjectMembers(categoryId);
      setMembers(freshMembers.members || res.members || []);
      await load();
    } catch (e) {
      setError(e.message || "Failed to remove member.");
    }
  }

  function flashCopy(key) {
    setCopyFlashKey(key);
    window.setTimeout(() => setCopyFlashKey(""), 2000);
  }

  async function copyTextValue(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      flashCopy(key);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function copyContextPack() {
    const pack = buildProjectContextPack(
      {
        categoryId,
        categoryName: category?.name,
        mantra,
        narrative,
        profile,
        rootTasks: tasks,
        healthNeeds,
        resources,
        efficiencyTip,
        suggestedMoves,
        legacyLinksText: projectLinks,
      },
      { format: "conversation_pack" }
    );
    await copyTextValue(pack, "context");
  }

  async function copyPlanningPrompt() {
    await copyTextValue(exportBundle.planning_prompt, "prompt");
  }

  async function copyExportJson() {
    await copyTextValue(exportBundle.json_seed, "json");
  }

  async function copyPromptBundle() {
    await copyTextValue(exportBundle.prompt_bundle, "bundle");
  }

  function downloadTextFile(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadExportBundle(format) {
    const safeName = String(category?.name || "project")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
    if (format === "md") {
      downloadTextFile(`${safeName}-external-ai-pack.md`, exportBundle.prompt_bundle, "text/markdown;charset=utf-8");
      return;
    }
    downloadTextFile(`${safeName}-external-ai-seed.json`, exportBundle.json_seed, "application/json;charset=utf-8");
  }

  async function handlePreviewImport() {
    if (!user || !categoryId || !importText.trim()) return;
    setImportLoading(true);
    setImportError("");
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData?.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token;
      }
      if (!token) throw new Error("Auth session missing. Please refresh and sign in again.");

      const response = await fetch("/api/project-import/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category_id: categoryId,
          import_text: importText,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to preview import.");
      setImportRun(payload.run || null);
      const actionIds =
        flattenExternalProjectImportActions(payload.run?.normalized_json || null, categoryId)
          .map((item) => item.id)
          .filter(Boolean);
      setSelectedImportActionIds(actionIds);
      setRecentImports((prev) => [payload.run, ...prev.filter((row) => row.id !== payload.run?.id)].slice(0, 6));
    } catch (e) {
      setImportError(e.message || "Failed to preview import.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleApplyImport() {
    if (!user || !importRun) return;
    setImportApplying(true);
    setImportError("");
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData?.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token;
      }
      if (!token) throw new Error("Auth session missing. Please refresh and sign in again.");

      const rejected = importActionIds.filter((id) => !selectedImportActionIds.includes(id));
      const response = await fetch("/api/project-import/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          run_id: importRun.id,
          accepted_action_ids: selectedImportActionIds,
          rejected_action_ids: rejected,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to apply import.");
      setImportRun(payload.run || importRun);
      await load();
    } catch (e) {
      setImportError(e.message || "Failed to apply import.");
    } finally {
      setImportApplying(false);
    }
  }

  function toggleImportAction(actionId) {
    setSelectedImportActionIds((prev) =>
      prev.includes(actionId)
        ? prev.filter((id) => id !== actionId)
        : [...prev, actionId]
    );
  }

  function handleImportFile(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setImportText(text || "");
    });
    e.target.value = "";
  }

  function toggleSimpleCard(taskId) {
    setExpandedSimpleCards((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
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

      const res = await createCollaborativeTask({
        ...updates,
        tags: parseTagText(taskTagsText),
      });
      const newTaskId = res.task?.id;
      if (newTaskId) {
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
          subtitle={`Source of truth, resources, and AI context — with Action Items scoped to this initiative. Access: ${category?._access?.role || "viewer"}.`}
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
              <button type="button" className="rs-btn-primary" onClick={openCreateTaskModal} disabled={!canEditProject}>
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
              <AutoHeightTextarea
                className="rs-input rs-project-mantra-input"
                value={mantra}
                onChange={setMantra}
                rows={2}
                disabled={!canEditProject}
                placeholder="One line that captures why this project exists (e.g. dignified transition for parents)."
              />
              <label className="rs-project-narrative-label">
                <span>Strategic source of truth</span>
                <textarea
                  className="rs-input rs-project-narrative"
                  value={narrative}
                  disabled={!canEditProject}
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
                  disabled={savingWorkspace || !canEditProject}
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
                    {sortedRootTasks.length} visible root initiative{sortedRootTasks.length === 1 ? "" : "s"} ·{" "}
                    {taskStatusScope === "open" ? "showing todo + doing by default" : "showing all statuses"} ·
                    strategic priority from scoring model
                  </p>
                </div>
                <div className="rs-project-sort">
                  <label>
                    Show
                    <select
                      className="rs-select-compact"
                      value={taskStatusScope}
                      onChange={(e) => setTaskStatusScope(e.target.value)}
                    >
                      <option value="open">Todo + Doing</option>
                      <option value="all">All tasks</option>
                    </select>
                  </label>
                  <label>
                    View
                    <select
                      className="rs-select-compact"
                      value={taskViewMode}
                      onChange={(e) => setTaskViewMode(e.target.value)}
                    >
                      <option value="full">Full</option>
                      <option value="simplified">Simplified</option>
                    </select>
                  </label>
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
                  <p className="rs-section-card__subtitle">
                    {taskStatusScope === "open"
                      ? "No todo or doing initiatives match this project right now."
                      : "No initiatives in this project yet."}
                  </p>
                ) : (
                  sortedRootTasks.map((t) => {
                    const kids = (childrenByParent.get(t.id) || [])
                      .filter(taskMatchesScope)
                      .slice()
                      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, {
                        sensitivity: "base",
                      }));
                    return (
                      <div key={t.id}>
                        <BacklogStrategicTaskCard
                          task={t}
                          sortedChildren={kids}
                          categories={categories}
                          memberOptions={members}
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
                          handleAssignTask={handleAssignTask}
                          tagText={t._tagsText ?? makeTagText(t)}
                          simplified={taskViewMode === "simplified"}
                          expanded={!!expandedSimpleCards[t.id]}
                          onToggleExpanded={() => toggleSimpleCard(t.id)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <aside className="rs-project-workspace__aside">
            <section className="rs-section-card">
              <h2 className="rs-section-card__title" style={{ marginBottom: 8 }}>
                Shared access
              </h2>
              <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
                {members.length || 1} collaborator{members.length === 1 ? "" : "s"} · {category?._access?.role || "viewer"}
              </p>
              <div className="rs-project-member-list">
                {members.map((member) => (
                  <div key={member.user_id} className="rs-project-member-row">
                    <div className="rs-project-member-row__email">{member.email_snapshot || member.user_id}</div>
                    {canManageMembers && member.role !== "owner" ? (
                      <div className="rs-project-member-row__actions">
                        <select
                          className="rs-select-compact"
                          value={member.role}
                          onChange={(e) => handleMemberRoleChange(member.user_id, e.target.value)}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button type="button" className="rs-btn-ghost rs-btn-ghost--small" onClick={() => handleRemoveMember(member.user_id)}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="rs-project-member-row__role">{member.role}</div>
                    )}
                  </div>
                ))}
              </div>
              {canManageMembers && (
                <div className="rs-project-share-box">
                  <input
                    type="email"
                    className="rs-input"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Member email"
                  />
                  <select className="rs-select-compact" value={shareRole} onChange={(e) => setShareRole(e.target.value)}>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button type="button" className="rs-btn-primary" onClick={handleAddMember} disabled={sharingMember || !shareEmail.trim()}>
                    {sharingMember ? "Sharing…" : "Share project"}
                  </button>
                </div>
              )}
            </section>
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
                Export this project into Claude, Grok, or ChatGPT, then preview a structured import before anything touches your source of truth.
              </p>
              <div className="rs-project-import-provider">
                <label className="rs-project-field-label" style={{ marginBottom: 0 }}>
                  Prompt target
                </label>
                <select
                  className="rs-select-compact"
                  value={aiProvider}
                  disabled={!canEditProject}
                  onChange={(e) => setAiProvider(e.target.value)}
                >
                  <option value="claude">Claude</option>
                  <option value="grok">Grok</option>
                  <option value="chatgpt">ChatGPT</option>
                  <option value="generic">Generic</option>
                </select>
              </div>
              <label className="rs-project-field-label">Efficiency / batching tip</label>
              <textarea
                className="rs-input"
                rows={3}
                value={efficiencyTip}
                disabled={!canEditProject}
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
                      disabled={!canEditProject}
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
                  disabled={!canEditProject}
                  onChange={(e) => setNewMoveText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSuggestedMove())}
                  placeholder="Add a line from your AI planner…"
                />
                <button type="button" className="rs-btn-ghost" onClick={addSuggestedMove} disabled={!canEditProject}>
                  Add
                </button>
              </div>
              <div className="rs-project-ai-actions">
                <button type="button" className="rs-btn-primary" onClick={copyContextPack}>
                  {copyFlashKey === "context" ? "Copied" : "Copy context"}
                </button>
                <button type="button" className="rs-btn-ghost" onClick={copyPlanningPrompt}>
                  {copyFlashKey === "prompt" ? "Copied" : "Copy planning prompt"}
                </button>
                <button type="button" className="rs-btn-ghost" onClick={copyExportJson}>
                  {copyFlashKey === "json" ? "Copied" : "Copy export JSON"}
                </button>
                <button type="button" className="rs-btn-ghost" onClick={copyPromptBundle}>
                  {copyFlashKey === "bundle" ? "Copied" : "Copy full bundle"}
                </button>
                <button type="button" className="rs-btn-ghost" onClick={() => downloadExportBundle("md")}>
                  Download .md
                </button>
                <button type="button" className="rs-btn-ghost" onClick={() => downloadExportBundle("json")}>
                  Download .json
                </button>
                <button type="button" className="rs-btn-ghost" onClick={persistFullWorkspace} disabled={savingWorkspace}>
                  Save AI notes
                </button>
              </div>

              <div className="rs-project-import-card">
                <div className="rs-project-import-card__head">
                  <div>
                    <h3 className="rs-section-card__title" style={{ fontSize: "0.95rem", marginBottom: 4 }}>
                      External AI import
                    </h3>
                    <p className="rs-section-card__subtitle" style={{ margin: 0 }}>
                      Paste the JSON response here or upload a file, then review every change before apply.
                    </p>
                  </div>
                  <label className="rs-btn-ghost rs-btn-ghost--small rs-project-import-upload">
                    Upload JSON
                    <input type="file" accept=".json,application/json,text/plain" onChange={handleImportFile} />
                  </label>
                </div>
                <textarea
                  className="rs-input rs-project-import-textarea"
                  rows={10}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='Paste the external AI response JSON here. Tip: tell the model to return only one JSON object with workspace_patch, task_actions, alignment_actions, and vision_suggestions.'
                />
                <div className="rs-project-ai-actions">
                  <button
                    type="button"
                    className="rs-btn-primary"
                    onClick={handlePreviewImport}
                    disabled={importLoading || !importText.trim()}
                  >
                    {importLoading ? "Previewing…" : "Preview import"}
                  </button>
                  <button
                    type="button"
                    className="rs-btn-ghost"
                    onClick={handleApplyImport}
                    disabled={importApplying || !importRun || selectedImportActionIds.length === 0}
                  >
                    {importApplying ? "Applying…" : `Apply selected (${selectedImportActionIds.length || 0})`}
                  </button>
                </div>

                {importError && (
                  <p className="rs-project-import-error">{importError}</p>
                )}

                {importRun?.preview_metrics && (
                  <div className="rs-project-import-metrics">
                    <span className="rs-project-import-pill">
                      Actions: <strong>{importRun.preview_metrics.total_actions || 0}</strong>
                    </span>
                    <span className="rs-project-import-pill">
                      Tasks: <strong>{importRun.preview_metrics.task_actions || 0}</strong>
                    </span>
                    <span className="rs-project-import-pill">
                      Alignment: <strong>{importRun.preview_metrics.alignment_actions || 0}</strong>
                    </span>
                    <span className="rs-project-import-pill">
                      Vision: <strong>{importRun.preview_metrics.vision_actions || 0}</strong>
                    </span>
                  </div>
                )}

                {importRun?.normalized_json?.summary && (
                  <div className="rs-project-import-summary">
                    {importRun.normalized_json.summary.current_state && (
                      <p><strong>Current state:</strong> {importRun.normalized_json.summary.current_state}</p>
                    )}
                    {importRun.normalized_json.summary.strategy && (
                      <p><strong>Strategy:</strong> {importRun.normalized_json.summary.strategy}</p>
                    )}
                    {importRun.normalized_json.summary.operator_notes && (
                      <p><strong>Operator notes:</strong> {importRun.normalized_json.summary.operator_notes}</p>
                    )}
                  </div>
                )}

                {importGroups.length > 0 && (
                  <div className="rs-project-import-groups">
                    {importGroups.map((group) => (
                      <div key={group.key} className="rs-project-import-group">
                        <h4 className="rs-project-import-group__title">{group.label}</h4>
                        <div className="rs-project-import-actions">
                          {group.items.map((item) => (
                            <label key={item.id} className="rs-project-import-action">
                              <input
                                type="checkbox"
                                checked={selectedImportActionIds.includes(item.id)}
                                onChange={() => toggleImportAction(item.id)}
                              />
                              <div>
                                <strong>{item.title}</strong>
                                {item.summary ? <p>{item.summary}</p> : null}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {recentImports.length > 0 && (
                  <div className="rs-project-import-history">
                    <h4 className="rs-project-import-group__title">Recent imports</h4>
                    <ul>
                      {recentImports.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="rs-project-import-history__btn"
                            onClick={() => {
                              setImportRun(row);
                              setSelectedImportActionIds(
                                flattenExternalProjectImportActions(row.normalized_json || null, categoryId)
                                  .map((item) => item.id)
                                  .filter(Boolean)
                              );
                            }}
                          >
                            <span>{new Date(row.created_at).toLocaleString()}</span>
                            <span>{row.status || "draft"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
