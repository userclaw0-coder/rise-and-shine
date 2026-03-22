import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import BacklogStrategicTaskCard from "../components/BacklogStrategicTaskCard";
import DashboardLayout from "../components/DashboardLayout";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import {
  getBacklogTasks,
  updateTaskStatusWithEvent,
  createTask,
  updateTask,
  setTaskTags,
  getCategoriesWithSubcategories,
  getAllTags,
  createCategory,
  ensureSubcategory,
  updateCategory,
  deleteCategory,
  getUserProfile,
  upsertUserProfile,
} from "../lib/db";
import { isMissingPrioritizationMetadata } from "../lib/task-enrichment";
import { supabase } from "../lib/supabaseClient";
import { computeTaskScore } from "../lib/scoring";

const STATUS_FILTERS = [
  { value: "todo_doing", label: "Todo & Doing" },
  { value: "todo", label: "Todo only" },
  { value: "doing", label: "Doing only" },
  { value: "done", label: "Done only" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All statuses" },
];

const STANDARD_TAGS = [
  "quick-win",
  "high-leverage",
  "urgent",
  "blocked",
  "waiting",
];

const COMFORTABLE_GRID_COLUMNS =
  "minmax(200px, 3fr) minmax(140px, 1.5fr) 86px minmax(120px, 1.1fr) 90px 130px minmax(120px, 1fr) minmax(100px, 0.9fr) minmax(100px, 1fr)";

/** Sort controls shared by strategic card view (+ legacy comfortable row for nested tasks in compact mode) */
const BACKLOG_SORT_KEYS = [
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "score", label: "Score" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "status", label: "Status" },
  { key: "outcome", label: "Outcome" },
  { key: "domain", label: "Domain" },
  { key: "tags", label: "Tags" },
];

const LIFE_DOMAIN_KEYS = ["business", "finances", "health", "relationships", "lifestyle", "growth"];
function lifeDomainLabel(key, profile) {
  if (!key) return "";
  const ld = profile?.life_domains;
  const text = ld && ld[key] ? String(ld[key]).slice(0, 24) : key;
  return text || key;
}

function normalize(str) {
  return (str || "").toLowerCase();
}

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractTagNames(task) {
  if (!task || !task.tags) return [];
  const result = [];
  for (const t of task.tags) {
    if (!t) continue;
    if (typeof t === "string") {
      result.push(t);
    } else if (t.tag && t.tag.name) {
      result.push(t.tag.name);
    } else if (t.name) {
      result.push(t.name);
    }
  }
  return result;
}

function makeTagText(task) {
  const names = extractTagNames(task);
  return names.join(", ");
}

function parseTagText(text) {
  return (text || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function formatEnrichmentPatch(patch) {
  const parts = [];
  if (patch?.priority) parts.push(`priority → ${patch.priority}`);
  if (patch?.effort_hours != null) parts.push(`effort → ${patch.effort_hours}h`);
  return parts.length > 0 ? parts.join(" · ") : "tags only";
}

function formatEnrichmentStatus(report) {
  if (!report) return null;
  if (report.ai_status === "ok") {
    return `AI ok · ${report.batches || 0} batch${report.batches === 1 ? "" : "es"} of ${report.batch_size || 25}`;
  }
  if (typeof report.ai_status === "string" && report.ai_status.startsWith("fallback:")) {
    return `Fallback used · ${report.ai_status.slice("fallback:".length)}`;
  }
  return report.ai_status || null;
}

export default function BacklogPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [tags, setTags] = useState([]);
  const [profile, setProfile] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todo_doing");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [categoryEdits, setCategoryEdits] = useState({});
  const [savingCategories, setSavingCategories] = useState(false);

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalCategoryId, setModalCategoryId] = useState("");
  const [modalSubcategoryText, setModalSubcategoryText] = useState("");
  const [modalPriority, setModalPriority] = useState("Medium");
  const [modalStatus, setModalStatus] = useState("todo");
  const [modalDueDate, setModalDueDate] = useState("");
  const [modalEffortHours, setModalEffortHours] = useState("");
  const [modalMoveToTop, setModalMoveToTop] = useState(false);
  const [modalTagsText, setModalTagsText] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  const [enriching, setEnriching] = useState(false);
  const [enrichReport, setEnrichReport] = useState(null);
  const [enrichmentStartedAt, setEnrichmentStartedAt] = useState(null);
  const [enrichmentProgressPct, setEnrichmentProgressPct] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [tasksRes, catsRes, tagsRes, profileRes] = await Promise.all([
          getBacklogTasks(user.id, { includeArchived: true }),
          getCategoriesWithSubcategories(user.id),
          getAllTags(user.id),
          getUserProfile(user.id),
        ]);

        if (tasksRes.error) {
          setError(tasksRes.error.message);
        } else {
          const enriched =
            (tasksRes.data || []).map((t) => ({
              ...t,
              _tagsText: makeTagText(t),
              _subcategoryText: t?.subcategory?.name || "",
            })) || [];
          setTasks(enriched);
        }

        if (!catsRes.error) {
          const catData = catsRes.data || [];
          setCategories(catData);
          const ids = catData.map((c) => c.id);
          const validId = (id) => typeof id === "string" && ids.includes(id);
          const serverOrder = profileRes?.data?.profile?.preferences?.category_order_ids;
          const validServer =
            Array.isArray(serverOrder) && serverOrder.every(validId)
              ? serverOrder.filter(validId)
              : null;
          let stored = null;
          if (!validServer && typeof window !== "undefined") {
            try {
              stored = JSON.parse(window.localStorage.getItem(`rs_category_order_${user.id}`) || "null");
            } catch {
              stored = null;
            }
          }
          const validStored =
            Array.isArray(stored) && stored.every((id) => typeof id === "string")
              ? stored
              : null;
          const orderSource = validServer || validStored;
          const merged = [
            ...(orderSource || []).filter((id) => ids.includes(id)),
            ...ids.filter((id) => !(orderSource || []).includes(id)),
          ];
          setCategoryOrder(merged);
        }

        if (!tagsRes.error) {
          setTags(tagsRes.data || []);
        }
        if (profileRes?.data?.profile) {
          setProfile(profileRes.data.profile);
        }
      } catch (e) {
        setError(e.message || "Failed to load backlog.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  // Apply quick filters from Analytics links.
  useEffect(() => {
    if (!router.isReady) return;
    const q = String(router.query.quick || "").trim();
    if (!q) return;

    setQuickFilter(q);
    // ensure we’re looking at open tasks by default for these quick views
    setStatusFilter("todo_doing");
    setSearch("");
    setCategoryFilter("");
    setSubcategoryFilter("");
    setTagFilter("");
  }, [router.isReady, router.query.quick]);

  useEffect(() => {
    if (!user) return;
    if (!categoryOrder || categoryOrder.length === 0) return;
    const storageKey = `rs_category_order_${user.id}`;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(categoryOrder));
      }
    } catch {
      // ignore storage errors
    }
  }, [categoryOrder, user]);

  const orderedCategories = useMemo(() => {
    if (!categories || categories.length === 0) return [];
    if (!categoryOrder || categoryOrder.length === 0) return categories;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const inOrder = categoryOrder
      .map((id) => byId.get(id))
      .filter(Boolean);
    const remaining = categories.filter((c) => !categoryOrder.includes(c.id));
    return [...inOrder, ...remaining];
  }, [categories, categoryOrder]);

  async function persistCategoryOrderToServer(order) {
    if (!user || !order?.length) return;
    try {
      const res = await getUserProfile(user.id);
      const existing = res?.data?.profile || {};
      const prefs = { ...(existing.preferences || {}), category_order_ids: order };
      await upsertUserProfile(user.id, { ...existing, preferences: prefs });
    } catch (_) {
      // localStorage already updated; server persist is best-effort
    }
  }

  function handleCategoryDrop(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const base =
      categoryOrder && categoryOrder.length
        ? categoryOrder.filter((id) => categories.some((c) => c.id === id))
        : categories.map((c) => c.id);
    const fromIndex = base.indexOf(sourceId);
    const toIndex = base.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = base.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setCategoryOrder(next);
    persistCategoryOrderToServer(next);
  }

  function handleOpenCategoryEditor() {
    const edits = {};
    for (const c of categories) {
      edits[c.id] = c.name;
    }
    setCategoryEdits(edits);
    setCategoryEditorOpen(true);
  }

  function handleCategoryEditChange(id, value) {
    setCategoryEdits((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSaveCategoryChanges() {
    if (!user) return;
    setSavingCategories(true);
    setError("");
    let hadError = false;
    try {
      for (const c of categories) {
        const nextName = (categoryEdits[c.id] ?? c.name).trim();
        if (!nextName || nextName === c.name) continue;
        // eslint-disable-next-line no-await-in-loop
        const res = await updateCategory(user.id, c.id, { name: nextName });
        if (res.error) {
          setError(res.error.message || "Failed to update category.");
          hadError = true;
          break;
        }
      }
      if (!hadError) {
        const catsRes = await getCategoriesWithSubcategories(user.id);
        if (!catsRes.error && Array.isArray(catsRes.data)) {
          setCategories(catsRes.data);
        }
        setCategoryEditorOpen(false);
      }
    } finally {
      setSavingCategories(false);
    }
  }

  async function handleDeleteCategoryClicked(id) {
    if (!user || !id) return;
    const confirmed = window.confirm(
      "Delete this category? Tasks will keep their category id; you can reassign them later."
    );
    if (!confirmed) return;
    setSavingCategories(true);
    setError("");
    try {
      const res = await deleteCategory(user.id, id);
      if (res.error) {
        setError(res.error.message || "Failed to delete category.");
      } else {
        const catsRes = await getCategoriesWithSubcategories(user.id);
        if (!catsRes.error && Array.isArray(catsRes.data)) {
          setCategories(catsRes.data);
        }
        setCategoryOrder((prev) => prev.filter((cid) => cid !== id));
        setCategoryEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } finally {
      setSavingCategories(false);
    }
  }

  const childrenByParent = useMemo(() => {
    const m = new Map();
    for (const t of tasks || []) {
      if (!t.parent_task_id) continue;
      const list = m.get(t.parent_task_id) || [];
      list.push(t);
      m.set(t.parent_task_id, list);
    }
    return m;
  }, [tasks]);

  const rootTasks = useMemo(
    () => (tasks || []).filter((t) => !t.parent_task_id),
    [tasks]
  );

  const estimatedEligibleCount = useMemo(
    () => (tasks || []).filter((t) => isMissingPrioritizationMetadata({
      priority: t.priority,
      effort_hours: t.effort_hours,
      tags: extractTagNames(t),
    })).length,
    [tasks]
  );

  useEffect(() => {
    if (!enriching) {
      setEnrichmentProgressPct(0);
      return undefined;
    }

    const estimatedBatches = Math.max(1, Math.ceil((estimatedEligibleCount || 1) / 10));
    const estimatedTotalMs = estimatedBatches * 5000;

    const tick = () => {
      if (!enrichmentStartedAt) return;
      const elapsed = Date.now() - enrichmentStartedAt;
      const pct = Math.min(95, Math.max(8, Math.round((elapsed / estimatedTotalMs) * 100)));
      setEnrichmentProgressPct(pct);
    };

    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [enriching, enrichmentStartedAt, estimatedEligibleCount]);

  const filteredRootTasks = useMemo(() => {
    const q = normalize(search);
    const tagNeedle = normalize(tagFilter);
    const todayLocal = localDateKey(new Date());
    const quick = String(quickFilter || "").toLowerCase();

    const filtered = rootTasks.filter((t) => {
      const titleMatch = !q || normalize(t.title).includes(q);

      let statusOk = true;
      if (statusFilter === "todo_doing") {
        statusOk = t.status === "todo" || t.status === "doing";
      } else if (statusFilter !== "all") {
        statusOk = t.status === statusFilter;
      }

      let categoryOk = true;
      if (categoryFilter) {
        categoryOk = t.category_id === categoryFilter;
      }

      let subcategoryOk = true;
      if (subcategoryFilter) {
        subcategoryOk = t.subcategory_id === subcategoryFilter;
      }

      let tagOk = true;
      if (tagNeedle) {
        const names = extractTagNames(t).map(normalize);
        tagOk = names.includes(tagNeedle);
      }

      let quickOk = true;
      if (quick === "overdue") {
        quickOk =
          !!t.due_date && localDateKey(new Date(t.due_date)) < todayLocal;
      } else if (quick === "critical_high") {
        quickOk = t.priority === "Critical" || t.priority === "High";
      }

      return titleMatch && statusOk && categoryOk && subcategoryOk && tagOk && quickOk;
    });

    return filtered
      .map((t) => {
        const scoring = computeTaskScore({
          ...t,
          tags: extractTagNames(t),
        });
        return {
          ...t,
          _aiPriorityScore: scoring.score,
        };
      });
  }, [
    rootTasks,
    search,
    statusFilter,
    categoryFilter,
    subcategoryFilter,
    tagFilter,
    quickFilter,
  ]);

  const [comfortableSortKey, setComfortableSortKey] = useState("score");
  const [comfortableSortDir, setComfortableSortDir] = useState("desc");

  const PRIORITY_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const STATUS_ORDER = { todo: 0, doing: 1, done: 2, archived: 3 };
  const sortedRootTasks = useMemo(() => {
    const list = [...filteredRootTasks];
    const key = comfortableSortKey;
    const dir = comfortableSortDir === "asc" ? 1 : -1;
    const catName = (t) => (t.category?.name ?? categories.find((c) => c.id === t.category_id)?.name ?? "");
    list.sort((a, b) => {
      let cmp = 0;
      if (key === "score") cmp = (a._aiPriorityScore ?? 0) - (b._aiPriorityScore ?? 0);
      else if (key === "title") cmp = String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
      else if (key === "category") cmp = catName(a).localeCompare(catName(b), undefined, { sensitivity: "base" });
      else if (key === "priority") cmp = (PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0);
      else if (key === "due") {
        const da = a.due_date ? new Date(a.due_date).getTime() : 0;
        const db = b.due_date ? new Date(b.due_date).getTime() : 0;
        cmp = da - db;
      } else if (key === "status") cmp = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
      else if (key === "outcome") cmp = String((Array.isArray(a.outcome_ids) && a.outcome_ids[0]) || "").localeCompare(String((Array.isArray(b.outcome_ids) && b.outcome_ids[0]) || ""), undefined, { sensitivity: "base" });
      else if (key === "domain") cmp = String(a.primary_life_domain || "").localeCompare(String(b.primary_life_domain || ""), undefined, { sensitivity: "base" });
      else if (key === "tags") cmp = (a._tagsText || "").localeCompare(b._tagsText || "", undefined, { sensitivity: "base" });
      if (cmp !== 0) return dir * cmp;
      return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
    });
    return list;
  }, [filteredRootTasks, comfortableSortKey, comfortableSortDir, categories]);

  const [collapsedParents, setCollapsedParents] = useState({});
  /** Strategic view: expand all subtasks on a parent card */
  const [expandedSubtasksByParent, setExpandedSubtasksByParent] = useState({});
  const [expandedTagPillsByTask, setExpandedTagPillsByTask] = useState({});
  const [quickCapture, setQuickCapture] = useState("");
  const [isCompact, setIsCompact] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [compactListMode, setCompactListMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const key = window.localStorage.getItem("backlog-comfortable-sort-key");
      const dir = window.localStorage.getItem("backlog-comfortable-sort-dir");
      if (
        key &&
        ["score", "title", "category", "priority", "due", "status", "tags", "outcome", "domain"].includes(
          key
        )
      )
        setComfortableSortKey(key);
      if (dir === "asc" || dir === "desc") setComfortableSortDir(dir);
    } catch (_) {}
    return undefined;
  }, []);
  function handleComfortableSort(key) {
    const same = comfortableSortKey === key;
    const nextDir = same ? (comfortableSortDir === "asc" ? "desc" : "asc") : (["title", "category", "outcome", "domain", "tags"].includes(key) ? "asc" : "desc");
    setComfortableSortKey(key);
    setComfortableSortDir(nextDir);
  }
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("backlog-comfortable-sort-key", comfortableSortKey);
      window.localStorage.setItem("backlog-comfortable-sort-dir", comfortableSortDir);
    } catch (_) {}
  }, [comfortableSortKey, comfortableSortDir]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const stored = window.localStorage.getItem("backlog-compact-list");
      setCompactListMode(stored === "1");
    } catch (_) {}
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 980px)");
    const onChange = () => setIsCompact(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function setCompactListModeAndSave(value) {
    setCompactListMode(value);
    try {
      window.localStorage.setItem("backlog-compact-list", value ? "1" : "0");
    } catch (_) {}
  }

  function toggleCollapsed(taskId) {
    setCollapsedParents((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  }

  function updateTaskLocal(taskId, patch) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
    );
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
      archived_at:
        nextStatus === "archived" ? new Date().toISOString() : null,
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
    const categoryId = task.category_id || null;
    const name = String(task._subcategoryText || "").trim();
    if (!categoryId) {
      setError("Select a category before setting a subcategory.");
      return;
    }
    if (!name) {
      await handleInlineSave(task.id, { subcategory_id: null });
      updateTaskLocal(task.id, { subcategory_id: null, subcategory: null, _subcategoryText: "" });
      return;
    }
    const subRes = await ensureSubcategory(user.id, categoryId, name);
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

  const openAddTaskModal = useCallback(
    (prefillTitle) => {
      setModalTitle(typeof prefillTitle === "string" ? prefillTitle : "");
      setModalCategoryId(categoryFilter || (categories[0]?.id ?? ""));
      setModalSubcategoryText("");
      setModalPriority("Medium");
      setModalStatus("todo");
      setModalDueDate("");
      setModalEffortHours("");
      setModalMoveToTop(false);
      setModalTagsText("");
      setError("");
      setAddTaskOpen(true);
    },
    [categoryFilter, categories]
  );

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openAddTaskModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAddTaskModal]);

  async function handleAddTaskFromModal() {
    if (!user || !modalTitle.trim()) return;
    const categoryId = modalCategoryId || categories[0]?.id;
    if (!categoryId) {
      setError("Create a category first (e.g. under Filter by).");
      return;
    }
    setAddingTask(true);
    setError("");
    let subcategoryId = null;
    const subName = (modalSubcategoryText || "").trim();
    if (subName) {
      const cat = categories.find((c) => c.id === categoryId);
      const existing = (cat?.subcategories || []).find(
        (s) => (s.name || "").trim().toLowerCase() === subName.toLowerCase()
      );
      if (existing) {
        subcategoryId = existing.id;
      } else {
        const subRes = await ensureSubcategory(user.id, categoryId, subName);
        if (subRes.error) {
          setError(subRes.error.message || "Failed to create subcategory.");
          setAddingTask(false);
          return;
        }
        if (subRes.data?.id) subcategoryId = subRes.data.id;
      }
    }
    const parsedTags = parseTagText(modalTagsText);
    const finalTags = modalMoveToTop
      ? Array.from(new Set(["fire-fighting", ...parsedTags]))
      : parsedTags;
    const finalStatus = modalMoveToTop ? "todo" : (modalStatus || "todo");
    const res = await createTask(user.id, {
      title: modalTitle.trim(),
      status: finalStatus,
      priority: modalMoveToTop ? "Critical" : (modalPriority || "Medium"),
      effort_hours: modalEffortHours === "" ? null : Number(modalEffortHours),
      due_date: modalDueDate || null,
      category_id: categoryId,
      subcategory_id: subcategoryId,
    });
    if (res.error) {
      setError(res.error.message);
      setAddingTask(false);
      return;
    }
    const created = {
      ...res.data,
      _tagsText: finalTags.join(", "),
      _subcategoryText: subName || (res.data?.subcategory?.name ?? ""),
    };
    if (finalTags.length > 0) {
      const tagRes = await setTaskTags(user.id, res.data.id, finalTags);
      if (!tagRes.error) {
        created.tags = finalTags.map((name) => ({ name }));
      }
    }
    setTasks((prev) => [created, ...prev]);
    setAddTaskOpen(false);
    setAddingTask(false);
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
    const created = { ...res.data, _tagsText: "", _subcategoryText: parent?.subcategory?.name || "" };
    setTasks((prev) => [...prev, created]);
    setCollapsedParents((prev) => ({
      ...prev,
      [parent.id]: false,
    }));
  }

  async function handleAddCategory() {
    if (!user || !newCategoryName.trim()) return;
    setAddingCategory(true);
    setError("");
    const res = await createCategory(user.id, newCategoryName.trim());
    if (res.error) {
      setError(res.error.message);
      setAddingCategory(false);
      return;
    }
    const listRes = await getCategoriesWithSubcategories(user.id);
    if (!listRes.error) setCategories(listRes.data || []);
    setNewCategoryName("");
    setAddingCategory(false);
  }

  async function runPrioritizationEnrichment(apply = false) {
    if (!user || enriching) return;
    setEnriching(true);
    setEnrichmentStartedAt(Date.now());
    setEnrichmentProgressPct(8);
    setError("");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setError("Auth session missing. Please refresh and sign in again.");
        return;
      }

      const res = await fetch("/api/tasks/enrich-prioritization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apply, dry_run: !apply }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        setError(payload?.error || "Failed to run enrichment.");
        return;
      }

      setEnrichmentProgressPct(100);
      setEnrichReport(payload);

      if (apply) {
        const tasksRes = await getBacklogTasks(user.id, { includeArchived: true });
        if (!tasksRes.error) {
          const refreshed = (tasksRes.data || []).map((t) => ({
            ...t,
            _tagsText: makeTagText(t),
          }));
          setTasks(refreshed);
        }
      }
    } catch (e) {
      setError(e?.message || "Failed to run enrichment.");
    } finally {
      setEnriching(false);
      setTimeout(() => setEnrichmentProgressPct(0), 800);
    }
  }

  function renderTaskRow(task, depth) {
    const children = childrenByParent.get(task.id) || [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedParents[task.id];
    const isDone = task.status === "done";

    const tagText = task._tagsText ?? makeTagText(task);

    const compactTableChrome = compactListMode && !isCompact;

    const titleInput = (
      <input
        type="text"
        value={task.title || ""}
        onChange={(e) =>
          updateTaskLocal(task.id, { title: e.target.value })
        }
        onBlur={(e) =>
          handleInlineSave(task.id, { title: e.target.value })
        }
        style={{
          width: "100%",
          minWidth: 0,
          fontSize: compactTableChrome ? 12 : isCompact ? 15 : 14,
          lineHeight: 1.4,
          padding: compactTableChrome ? "4px 6px" : isCompact ? "10px 12px" : "8px 10px",
          borderRadius: compactTableChrome ? 4 : 8,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          textDecoration: isDone ? "line-through" : "none",
          color: isDone ? "#6b7280" : "#111827",
        }}
        placeholder="Task title…"
      />
    );

    const checkboxControl = (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: compactTableChrome ? 20 : isCompact ? 44 : 24,
          minHeight: compactTableChrome ? 20 : isCompact ? 44 : 24,
          cursor: "pointer",
          flexShrink: 0,
        }}
        title="Mark complete"
      >
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => handleStatusChange(task, e.target.checked ? "done" : "todo")}
          style={{
            width: compactTableChrome ? 14 : isCompact ? 22 : 18,
            height: compactTableChrome ? 14 : isCompact ? 22 : 18,
            cursor: "pointer",
          }}
        />
      </label>
    );

    // Wide compact table is unusable on narrow viewports (title column minmax(0,*) collapses).
    // Mobile uses the same card row as "Strategic" compact mode.
    if (compactListMode && !isCompact) {
      return (
        <div key={task.id}>
          <div
            style={{
              display: "grid",
              // 10 tracks = title + category + pri + hrs + due + status + outcome + domain + actions + tags
              gridTemplateColumns:
                "minmax(160px, 2fr) minmax(100px, 1fr) 72px 52px 78px 92px 72px 56px 88px minmax(100px, 1.1fr)",
              gap: 6,
              alignItems: "center",
              padding: "4px 0",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <div style={{ width: depth * 8 }} />
              {checkboxControl}
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => toggleCollapsed(task.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 2,
                    cursor: "pointer",
                    fontSize: 10,
                    color: "#6b7280",
                  }}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
              )}
              {!hasChildren && depth > 0 && <span style={{ fontSize: 10, color: "#d1d5db" }}>•</span>}
              <div style={{ flex: 1, minWidth: 0 }}>{titleInput}</div>
            </div>
            <select
              value={task.category_id || ""}
              onChange={(e) => {
                const cid = e.target.value || null;
                updateTaskLocal(task.id, {
                  category_id: cid,
                  subcategory_id: null,
                  _subcategoryText: "",
                  subcategory: null,
                });
                handleInlineSave(task.id, { category_id: cid, subcategory_id: null });
              }}
              style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff" }}
            >
              <option value="">Cat</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={task.priority || "Medium"}
              onChange={(e) => handleInlineSave(task.id, { priority: e.target.value })}
              style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff" }}
            >
              <option value="Critical">P1</option>
              <option value="High">P2</option>
              <option value="Medium">P3</option>
              <option value="Low">P4</option>
            </select>
            <input
              type="number"
              step="0.25"
              value={task.effort_hours ?? ""}
              placeholder="h"
              onChange={(e) => updateTaskLocal(task.id, { effort_hours: e.target.value === "" ? null : Number(e.target.value) })}
              onBlur={(e) => handleInlineSave(task.id, { effort_hours: e.target.value === "" ? null : Number(e.target.value) })}
              style={{ fontSize: 11, padding: "3px 4px", width: 36, borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff" }}
            />
            <input
              type="date"
              value={task.due_date || ""}
              onChange={(e) => {
                updateTaskLocal(task.id, { due_date: e.target.value || null });
                handleInlineSave(task.id, { due_date: e.target.value || null });
              }}
              style={{ fontSize: 11, padding: "3px 4px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff" }}
            />
            <select
              value={task.status || "todo"}
              onChange={(e) => handleStatusChange(task, e.target.value)}
              style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff" }}
            >
              <option value="todo">Todo</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
              <option value="archived">Arch</option>
            </select>
            <select
              value={(Array.isArray(task.outcome_ids) && task.outcome_ids[0]) || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                const outcome_ids = v ? [v] : [];
                updateTaskLocal(task.id, { outcome_ids });
                handleInlineSave(task.id, { outcome_ids, primary_life_domain: task.primary_life_domain || undefined, alignment_source: "user" });
              }}
              title="Outcome"
              style={{ fontSize: 11, padding: "3px 4px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff", minWidth: 0 }}
            >
              <option value="">Outcome</option>
              {(profile?.desired_outcomes || []).map((o) => (
                <option key={o.id || o.title} value={o.id || o.title}>{(o.title || o.id || "").slice(0, 20)}</option>
              ))}
            </select>
            <select
              value={task.primary_life_domain || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                updateTaskLocal(task.id, { primary_life_domain: v });
                handleInlineSave(task.id, { outcome_ids: task.outcome_ids, primary_life_domain: v || null, alignment_source: "user" });
              }}
              title="Domain"
              style={{ fontSize: 11, padding: "3px 4px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff", minWidth: 0 }}
            >
              <option value="">Domain</option>
              {LIFE_DOMAIN_KEYS.map((key) => (
                <option key={key} value={key}>{key.slice(0, 6)}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 0 }}>
              <button type="button" onClick={() => handleAddSubtask(task)} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer" }}>+Sub</button>
              {task.status === "archived" ? (
                <button type="button" onClick={() => handleStatusChange(task, "todo")} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #86efac", background: "#ecfdf5", cursor: "pointer" }}>Restore</button>
              ) : (
                <button type="button" onClick={() => handleStatusChange(task, "archived")} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}>Archive</button>
              )}
            </div>
            <input
              type="text"
              value={tagText}
              onChange={(e) => updateTaskLocal(task.id, { _tagsText: e.target.value })}
              onBlur={(e) => handleTagsSave(task.id, e.target.value)}
              placeholder="tags"
              style={{ width: "100%", minWidth: 0, fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#fff" }}
            />
          </div>
          {!isCollapsed && children.map((child) => renderTaskRow(child, depth + 1))}
        </div>
      );
    }

    if (isCompact) {
      return (
        <div key={task.id}>
          <div
            style={{
              marginBottom: 12,
              padding: 14,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ width: depth * 16 }} />
              {checkboxControl}
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => toggleCollapsed(task.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    color: "#6b7280",
                    minWidth: 44,
                    minHeight: 44,
                  }}
                  aria-label={isCollapsed ? "Expand subtasks" : "Collapse subtasks"}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
              )}
              {!hasChildren && depth > 0 && (
                <span style={{ fontSize: 12, color: "#9ca3af", alignSelf: "center" }}>•</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>{titleInput}</div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginLeft: depth * 16 + 56,
                fontSize: 13,
                color: "#4b5563",
              }}
            >
              <select
                value={task.category_id || ""}
                onChange={(e) => {
                  const cid = e.target.value || null;
                  updateTaskLocal(task.id, {
                    category_id: cid,
                    subcategory_id: null,
                    _subcategoryText: "",
                    subcategory: null,
                  });
                  handleInlineSave(task.id, { category_id: cid, subcategory_id: null });
                }}
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                }}
              >
                <option value="">Category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={task._subcategoryText ?? task?.subcategory?.name ?? ""}
                placeholder="Subcategory"
                onChange={(e) => updateTaskLocal(task.id, { _subcategoryText: e.target.value })}
                onBlur={() => handleSubcategorySave(task)}
                list={task.category_id ? `subcategory-options-${task.category_id}` : undefined}
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                  width: 120,
                }}
              />
              <select
                value={task.priority || "Medium"}
                onChange={(e) =>
                  handleInlineSave(task.id, { priority: e.target.value })
                }
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                }}
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <input
                type="number"
                step="0.25"
                value={task.effort_hours ?? ""}
                placeholder="hrs"
                onChange={(e) =>
                  updateTaskLocal(task.id, {
                    effort_hours: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                onBlur={(e) =>
                  handleInlineSave(task.id, {
                    effort_hours:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  width: 64,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                }}
              />
              <input
                type="date"
                value={task.due_date || ""}
                onChange={(e) => {
                  updateTaskLocal(task.id, { due_date: e.target.value || null });
                  handleInlineSave(task.id, { due_date: e.target.value || null });
                }}
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginLeft: depth * 16 + 56,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <select
                value={task.status || "todo"}
                onChange={(e) => handleStatusChange(task, e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                }}
              >
                <option value="todo">Todo</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
              </select>
              <button
                type="button"
                onClick={() => handleAddSubtask(task)}
                style={{
                  fontSize: 13,
                  padding: "8px 14px",
                  minHeight: 44,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                + Subtask
              </button>
              {task.status === "archived" ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "todo")}
                  style={{
                    fontSize: 13,
                    padding: "8px 14px",
                    minHeight: 44,
                    borderRadius: 8,
                    border: "1px solid #86efac",
                    background: "#ecfdf5",
                    cursor: "pointer",
                  }}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "archived")}
                  style={{
                    fontSize: 13,
                    padding: "8px 14px",
                    minHeight: 44,
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    cursor: "pointer",
                  }}
                >
                  Archive
                </button>
              )}
            </div>
            {compactListMode && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginLeft: depth * 16 + 56,
                  marginTop: 8,
                  alignItems: "center",
                }}
              >
                <select
                  value={(Array.isArray(task.outcome_ids) && task.outcome_ids[0]) || ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    const outcome_ids = v ? [v] : [];
                    updateTaskLocal(task.id, { outcome_ids });
                    handleInlineSave(task.id, {
                      outcome_ids,
                      primary_life_domain: task.primary_life_domain || undefined,
                      alignment_source: "user",
                    });
                  }}
                  style={{
                    fontSize: 13,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    minHeight: 44,
                    flex: "1 1 160px",
                    minWidth: 0,
                  }}
                >
                  <option value="">Outcome…</option>
                  {(profile?.desired_outcomes || []).map((o) => (
                    <option key={o.id || o.title} value={o.id || o.title}>
                      {(o.title || o.id || "").slice(0, 48)}
                    </option>
                  ))}
                </select>
                <select
                  value={task.primary_life_domain || ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    updateTaskLocal(task.id, { primary_life_domain: v });
                    handleInlineSave(task.id, {
                      outcome_ids: task.outcome_ids,
                      primary_life_domain: v || null,
                      alignment_source: "user",
                    });
                  }}
                  style={{
                    fontSize: 13,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    minHeight: 44,
                    flex: "1 1 140px",
                    minWidth: 0,
                  }}
                >
                  <option value="">Life domain…</option>
                  {LIFE_DOMAIN_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {lifeDomainLabel(key, profile) || key}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginLeft: depth * 16 + 56, marginTop: 8 }}>
              <input
                type="text"
                value={tagText}
                onChange={(e) =>
                  updateTaskLocal(task.id, { _tagsText: e.target.value })
                }
                onBlur={(e) => handleTagsSave(task.id, e.target.value)}
                placeholder="Tags (comma separated)"
                style={{
                  width: "100%",
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  minHeight: 44,
                }}
              />
            </div>
          </div>
          {!isCollapsed &&
            children.map((child) => renderTaskRow(child, depth + 1))}
        </div>
      );
    }

    return (
      <div key={task.id}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COMFORTABLE_GRID_COLUMNS,
            gap: 6,
            alignItems: "center",
            padding: "8px 0",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <div style={{ width: depth * 12 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                flexShrink: 0,
              }}
            >
              {checkboxControl}
            </div>
            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleCollapsed(task.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                {isCollapsed ? "▶" : "▼"}
              </button>
            )}
            {!hasChildren && depth > 0 && (
              <span style={{ fontSize: 10, color: "#d1d5db" }}>•</span>
            )}
            <div style={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex" }}>
              <textarea
                rows={2}
                value={task.title || ""}
                onChange={(e) =>
                  updateTaskLocal(task.id, { title: e.target.value })
                }
                onBlur={(e) =>
                  handleInlineSave(task.id, { title: e.target.value })
                }
                style={{
                  width: "100%",
                  minWidth: 0,
                  minHeight: 52,
                  maxHeight: 88,
                  resize: "none",
                  overflowY: "auto",
                  overflowX: "hidden",
                  fontSize: 13,
                  lineHeight: 1.35,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  textDecoration: isDone ? "line-through" : "none",
                  color: isDone ? "#6b7280" : "#111827",
                }}
                placeholder="Task title…"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
            <select
              value={task.category_id || ""}
              onChange={(e) => {
                const cid = e.target.value || null;
                updateTaskLocal(task.id, {
                  category_id: cid,
                  subcategory_id: null,
                  _subcategoryText: "",
                  subcategory: null,
                });
                handleInlineSave(task.id, { category_id: cid, subcategory_id: null });
              }}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={task._subcategoryText ?? task?.subcategory?.name ?? ""}
              placeholder="Subcategory…"
              onChange={(e) => updateTaskLocal(task.id, { _subcategoryText: e.target.value })}
              onBlur={() => handleSubcategorySave(task)}
              list={task.category_id ? `subcategory-options-${task.category_id}` : undefined}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            />
          </div>

          {!isCompact && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                title="AI priority score derived from current prioritization model"
                style={{
                  minWidth: 82,
                  textAlign: "center",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 999,
                  border: "1px solid #dbeafe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontWeight: 600,
                }}
              >
                {Number.isFinite(task._aiPriorityScore) ? task._aiPriorityScore.toFixed(1) : "—"}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
            <select
              value={task.priority || "Medium"}
              onChange={(e) =>
                handleInlineSave(task.id, { priority: e.target.value })
              }
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <input
              type="number"
              step="0.25"
              value={task.effort_hours ?? ""}
              placeholder="hrs"
              onChange={(e) =>
                updateTaskLocal(task.id, {
                  effort_hours: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              onBlur={(e) =>
                handleInlineSave(task.id, {
                  effort_hours:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              style={{
                width: 56,
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            />
          </div>

          <input
            type="date"
            value={task.due_date || ""}
            onChange={(e) => {
              updateTaskLocal(task.id, { due_date: e.target.value || null });
              handleInlineSave(task.id, { due_date: e.target.value || null });
            }}
            style={{
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <select
              value={task.status || "todo"}
              onChange={(e) => handleStatusChange(task, e.target.value)}
              style={{
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="todo">Todo</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
              <option value="archived">Archived</option>
            </select>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleAddSubtask(task)}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                + Subtask
              </button>
              {task.status === "archived" ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "todo")}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #86efac",
                    background: "#ecfdf5",
                    cursor: "pointer",
                  }}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "archived")}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    cursor: "pointer",
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <select
              value={(Array.isArray(task.outcome_ids) && task.outcome_ids[0]) || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                const outcome_ids = v ? [v] : [];
                updateTaskLocal(task.id, { outcome_ids });
                handleInlineSave(task.id, { outcome_ids, primary_life_domain: task.primary_life_domain || undefined, alignment_source: "user" });
              }}
              title="Outcome (Vision)"
              style={{
                width: "100%",
                fontSize: 12,
                padding: "5px 6px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="">Outcome…</option>
              {(profile?.desired_outcomes || []).map((o) => (
                <option key={o.id || o.title} value={o.id || o.title}>
                  {(o.title || o.id || "").slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <select
              value={task.primary_life_domain || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                updateTaskLocal(task.id, { primary_life_domain: v });
                handleInlineSave(task.id, { outcome_ids: task.outcome_ids, primary_life_domain: v || null, alignment_source: "user" });
              }}
              title="Life domain"
              style={{
                width: "100%",
                fontSize: 12,
                padding: "5px 6px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="">Domain…</option>
              {LIFE_DOMAIN_KEYS.map((key) => (
                <option key={key} value={key}>
                  {lifeDomainLabel(key, profile) || key}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 0 }} title="e.g. quick-win, high-leverage, urgent">
            <input
              type="text"
              value={tagText}
              onChange={(e) =>
                updateTaskLocal(task.id, { _tagsText: e.target.value })
              }
              onBlur={(e) => handleTagsSave(task.id, e.target.value)}
              placeholder="Tags"
              style={{
                width: "100%",
                fontSize: 12,
                padding: "5px 6px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            />
          </div>
        </div>

        {!isCollapsed &&
          children.map((child) => renderTaskRow(child, depth + 1))}
      </div>
    );
  }

  if (!user || loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "var(--rs-on-surface-variant)" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <PageHeader
          eyebrow="Strategic productivity"
          title="Action Items"
          subtitle="Manage initiatives, subtasks, tags, and AI-scored priority — card view keeps the critical path visible. Open each project workspace from Projects in the sidebar."
        />

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>
            {error}
          </p>
        )}

        {/* Top bar: Search + Filters toggle (mobile) + Add task — always visible */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Search intent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rs-input"
            style={{
              flex: "1 1 200px",
              minWidth: 0,
              fontSize: 14,
              padding: "10px 14px",
              borderRadius: "var(--rs-radius-md)",
            }}
          />
          {isCompact && (
            <button
              type="button"
              onClick={() => setFiltersExpanded((e) => !e)}
              style={{
                fontSize: 14,
                padding: "10px 16px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: filtersExpanded ? "#f3f4f6" : "#ffffff",
                color: "#374151",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {filtersExpanded ? "Hide filters" : "Filters"}
            </button>
          )}
          <div
            style={{
              display: "flex",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              overflow: "hidden",
              background: "#f9fafb",
            }}
          >
            <button
              type="button"
              onClick={() => setCompactListModeAndSave(false)}
              style={{
                fontSize: 13,
                padding: "8px 14px",
                minHeight: 44,
                border: "none",
                background: !compactListMode ? "#ffffff" : "transparent",
                color: !compactListMode ? "#111827" : "#6b7280",
                cursor: "pointer",
                fontWeight: !compactListMode ? 500 : 400,
                boxShadow: !compactListMode ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
            >
              Strategic
            </button>
            <button
              type="button"
              onClick={() => setCompactListModeAndSave(true)}
              style={{
                fontSize: 13,
                padding: "8px 14px",
                minHeight: 44,
                border: "none",
                background: compactListMode ? "#ffffff" : "transparent",
                color: compactListMode ? "#111827" : "#6b7280",
                cursor: "pointer",
                fontWeight: compactListMode ? 500 : 400,
                boxShadow: compactListMode ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
            >
              Compact list
            </button>
          </div>
          <button type="button" onClick={() => openAddTaskModal()} className="rs-btn-primary" style={{ minHeight: 44 }}>
            + Add task
          </button>
        </div>

        {!compactListMode && (
          <form
            className="rs-backlog-capture"
            onSubmit={(e) => {
              e.preventDefault();
              const v = quickCapture.trim();
              if (v) {
                openAddTaskModal(v);
                setQuickCapture("");
              }
            }}
          >
            <span className="material-symbols-outlined" aria-hidden>
              add
            </span>
            <input
              value={quickCapture}
              onChange={(e) => setQuickCapture(e.target.value)}
              placeholder="Capture a new strategic task…"
              aria-label="Quick capture task title"
            />
            <span className="rs-backlog-capture__hint">⌘K · Ctrl+K</span>
          </form>
        )}

        {/* Filter sections — hidden on mobile unless filters expanded */}
        {(!isCompact || filtersExpanded) && (
          <>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "#6b7280", marginRight: 4 }}>
            Show:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter("todo_doing")}
            className={`rs-filter-pill${statusFilter === "todo_doing" ? " rs-filter-pill--active" : ""}`}
          >
            Todo &amp; Doing
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("done")}
            className={`rs-filter-pill${statusFilter === "done" ? " rs-filter-pill--active" : ""}`}
          >
            Completed
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("archived")}
            className={`rs-filter-pill${statusFilter === "archived" ? " rs-filter-pill--active" : ""}`}
          >
            Archived
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}>
            Category (drag to prioritize):
          </span>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("");
              setSubcategoryFilter("");
            }}
            className={`rs-filter-pill${!categoryFilter ? " rs-filter-pill--active" : ""}`}
          >
            All focus
          </button>
          {orderedCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = e.dataTransfer.getData("text/plain");
                handleCategoryDrop(sourceId, c.id);
              }}
              onClick={() => {
                setCategoryFilter(c.id);
                setSubcategoryFilter("");
              }}
              className={`rs-filter-pill${categoryFilter === c.id ? " rs-filter-pill--active" : ""}`}
              title="Drag to change category priority (left = highest)"
            >
              {c.name}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}>
            Filter by:
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value || "");
                setSubcategoryFilter("");
              }}
              style={{
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                minWidth: 140,
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Subcategory</span>
            <select
              value={subcategoryFilter}
              onChange={(e) => setSubcategoryFilter(e.target.value || "")}
              style={{
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                minWidth: 140,
              }}
            >
              <option value="">All subcategories</option>
              {categories
                .find((c) => c.id === categoryFilter)
                ?.subcategories?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          {categoryFilter ? (
            <Link
              href={`/category/${categoryFilter}`}
              className="rs-btn-ghost"
              style={{ fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              Project workspace →
            </Link>
          ) : null}
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Tag</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value || "")}
              style={{
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                minWidth: 140,
              }}
            >
              <option value="">Any tag</option>
              {STANDARD_TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {tags.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          id="rs-backlog-add-category"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}>
            Add category:
          </span>
          <input
            type="text"
            placeholder="New category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            style={{
              fontSize: 13,
              padding: "6px 8px",
              width: 180,
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          />
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={!newCategoryName.trim() || addingCategory}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #059669",
              background: "#059669",
              color: "#ffffff",
              cursor: newCategoryName.trim() && !addingCategory ? "pointer" : "not-allowed",
              opacity: newCategoryName.trim() && !addingCategory ? 1 : 0.6,
            }}
          >
            {addingCategory ? "Adding…" : "Add category"}
          </button>
          <button
            type="button"
            onClick={handleOpenCategoryEditor}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #4b5563",
              background: "#ffffff",
              color: "#111827",
              cursor: "pointer",
            }}
          >
            Edit categories
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "#6b7280" }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              fontSize: 13,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              minWidth: 160,
            }}
            title="Fine-grained status"
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
          </>
        )}

        <div
          style={{
            marginBottom: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => runPrioritizationEnrichment(false)}
            disabled={enriching}
            style={{
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
              cursor: enriching ? "not-allowed" : "pointer",
              opacity: enriching ? 0.6 : 1,
            }}
          >
            {enriching ? "Enriching…" : "AI Enrich (dry run)"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Apply enrichment updates to missing task metadata now?")) {
                runPrioritizationEnrichment(true);
              }
            }}
            disabled={enriching}
            style={{
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #059669",
              background: "#ecfdf5",
              color: "#047857",
              cursor: enriching ? "not-allowed" : "pointer",
              opacity: enriching ? 0.6 : 1,
            }}
          >
            Apply enrichment
          </button>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Fills missing priority/effort/tags only across all eligible backlog tasks.
          </span>
        </div>

        {enriching && (
          <div
            style={{
              marginBottom: 10,
              border: "1px solid #dbeafe",
              borderRadius: 12,
              padding: "10px 12px",
              background: "#eff6ff",
              fontSize: 12,
              color: "#1e3a8a",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>Processing enrichment…</strong>
              <span>estimated {enrichmentProgressPct}%</span>
            </div>
            <div style={{ height: 10, background: "#dbeafe", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  width: `${enrichmentProgressPct}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #2563eb, #60a5fa)",
                  transition: "width 240ms ease",
                }}
              />
            </div>
            <div>
              Running across approximately {estimatedEligibleCount || 0} eligible backlog tasks in AI batches of 10.
            </div>
          </div>
        )}

        {enrichReport && (
          <div
            style={{
              marginBottom: 10,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "10px 12px",
              background: "#f9fafb",
              fontSize: 12,
              color: "#374151",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div>
              <strong>{enrichReport.apply ? "Enrichment applied" : "Dry-run preview"}</strong>
              {` · processed ${enrichReport.processed || 0}`}
              {typeof enrichReport.total_eligible === "number" ? ` of ${enrichReport.total_eligible} eligible` : ""}
              {` · updated ${(enrichReport.report?.updated || []).length}`}
              {` · skipped ${(enrichReport.report?.skipped || []).length}`}
              {` · errors ${(enrichReport.report?.errors || []).length}`}
            </div>

            {formatEnrichmentStatus(enrichReport) && (
              <div style={{ color: enrichReport.ai_status === "ok" ? "#065f46" : "#92400e" }}>
                {formatEnrichmentStatus(enrichReport)}
              </div>
            )}

            {(enrichReport.report?.updated || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 600 }}>Preview of updates</div>
                {(enrichReport.report?.updated || []).slice(0, 12).map((row) => (
                  <div
                    key={row.task_id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "8px 10px",
                      background: "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{row.title}</div>
                    <div style={{ color: "#4b5563" }}>{formatEnrichmentPatch(row.patch)}</div>
                    <div style={{ color: "#6b7280" }}>
                      tags: {(row.tags_before || []).join(", ") || "none"} → {(row.tags_after || []).join(", ") || "none"}
                    </div>
                    {row.enrichment?.rationale && (
                      <div style={{ color: "#6b7280" }}>why: {row.enrichment.rationale}</div>
                    )}
                    {row.enrichment?.source && (
                      <div style={{ color: "#6b7280" }}>source: {row.enrichment.source}</div>
                    )}
                  </div>
                ))}
                {(enrichReport.report?.updated || []).length > 12 && (
                  <div style={{ color: "#6b7280" }}>
                    Showing first 12 of {(enrichReport.report?.updated || []).length} updated tasks.
                  </div>
                )}
              </div>
            )}

            {(enrichReport.report?.errors || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontWeight: 600, color: "#991b1b" }}>Errors</div>
                {(enrichReport.report?.errors || []).slice(0, 5).map((row) => (
                  <div key={row.task_id} style={{ color: "#991b1b" }}>
                    {row.title}: {row.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Modal
          title="Add task"
          open={addTaskOpen}
          onClose={() => !addingTask && setAddTaskOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Title</span>
              <input
                type="text"
                placeholder="What needs to be done?"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTaskFromModal()}
                autoFocus
                style={{
                  fontSize: 15,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Category</span>
              <select
                value={modalCategoryId}
                onChange={(e) => {
                  setModalCategoryId(e.target.value || "");
                  setModalSubcategoryText("");
                }}
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Subcategory (optional)</span>
              <input
                type="text"
                placeholder="Type or choose existing…"
                value={modalSubcategoryText}
                onChange={(e) => setModalSubcategoryText(e.target.value)}
                list={modalCategoryId ? `subcategory-datalist-modal-${modalCategoryId}` : undefined}
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              />
              {modalCategoryId && (
                <datalist id={`subcategory-datalist-modal-${modalCategoryId}`}>
                  {(categories.find((c) => c.id === modalCategoryId)?.subcategories || []).map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              )}
            </label>
            <div className="rs-form-grid-2">
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Priority</span>
                <select
                  value={modalPriority}
                  onChange={(e) => setModalPriority(e.target.value)}
                  disabled={modalMoveToTop}
                  style={{
                    fontSize: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: modalMoveToTop ? "#f3f4f6" : "#ffffff",
                  }}
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Status</span>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value)}
                  style={{
                    fontSize: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                  }}
                >
                  <option value="todo">todo</option>
                  <option value="doing">doing</option>
                  <option value="done">done</option>
                  <option value="archived">archived</option>
                </select>
              </label>
            </div>
            <div className="rs-form-grid-2">
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Due date</span>
                <input
                  type="date"
                  value={modalDueDate}
                  onChange={(e) => setModalDueDate(e.target.value)}
                  style={{
                    fontSize: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Effort hours</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={modalEffortHours}
                  onChange={(e) => setModalEffortHours(e.target.value)}
                  style={{
                    fontSize: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                  }}
                />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Tags (optional, comma-separated)</span>
              <input
                type="text"
                placeholder="e.g. quick-win, urgent"
                value={modalTagsText}
                onChange={(e) => setModalTagsText(e.target.value)}
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 13,
                color: "#374151",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: modalMoveToTop ? "#fef2f2" : "#f9fafb",
              }}
            >
              <input
                type="checkbox"
                checked={modalMoveToTop}
                onChange={(e) => setModalMoveToTop(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong>Move to top</strong> — marks this as urgent today, auto-adds
                <code style={{ marginLeft: 4 }}>fire-fighting</code>, and forces
                <code style={{ marginLeft: 4 }}>Critical</code> priority.
              </span>
            </label>
            {error && (
              <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleAddTaskFromModal}
                disabled={!modalTitle.trim() || addingTask}
                style={{
                  fontSize: 14,
                  padding: "10px 18px",
                  minHeight: 44,
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "#ffffff",
                  cursor: modalTitle.trim() && !addingTask ? "pointer" : "not-allowed",
                  opacity: modalTitle.trim() && !addingTask ? 1 : 0.6,
                }}
              >
                {addingTask ? "Adding…" : "Add task"}
              </button>
              <button
                type="button"
                onClick={() => !addingTask && setAddTaskOpen(false)}
                style={{
                  fontSize: 14,
                  padding: "10px 18px",
                  minHeight: 44,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          title="Edit categories"
          open={categoryEditorOpen}
          onClose={() => !savingCategories && setCategoryEditorOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              Reorder, rename, or delete categories. Order here controls priority from left (highest) to right (lowest) on the Action Items page.
            </p>
            <div
              style={{
                maxHeight: 260,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {orderedCategories.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ cursor: "grab", fontSize: 14, userSelect: "none" }} title="Drag on the main page to change order">☰</span>
                  <input
                    type="text"
                    value={categoryEdits[c.id] ?? c.name}
                    onChange={(e) => handleCategoryEditChange(c.id, e.target.value)}
                    style={{
                      flex: 1,
                      fontSize: 13,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteCategoryClicked(c.id)}
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #dc2626",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
              {orderedCategories.length === 0 && (
                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  No categories yet. Add one from the main Action Items page first.
                </p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setCategoryEditorOpen(false)}
                disabled={savingCategories}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCategoryChanges}
                disabled={savingCategories}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#ffffff",
                  cursor: savingCategories ? "wait" : "pointer",
                }}
              >
                {savingCategories ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </Modal>

        {/* One datalist per category — used by strategic cards + compact table */}
        {categories.map((c) => (
          <datalist key={c.id} id={`subcategory-options-${c.id}`}>
            {(c.subcategories || []).map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        ))}

        {!compactListMode && (
          <div className="rs-backlog-sort-bar">
            <span className="rs-backlog-sort-bar__label">Sort initiatives</span>
            {BACKLOG_SORT_KEYS.map(({ key, label }) => {
              const active = comfortableSortKey === key;
              const arrow = active ? (comfortableSortDir === "asc" ? " ↑" : " ↓") : "";
              return (
                <button
                  key={key}
                  type="button"
                  className={`rs-backlog-sort-btn${active ? " rs-backlog-sort-btn--active" : ""}`}
                  onClick={() => handleComfortableSort(key)}
                  title={`Sort by ${label} (${active && comfortableSortDir === "asc" ? "desc" : "asc"})`}
                >
                  {label}
                  {arrow}
                </button>
              );
            })}
          </div>
        )}

        {compactListMode ? (
          <div
            className="backlog-table-wrap"
            style={{
              marginTop: 6,
              borderRadius: "var(--rs-radius-lg)",
              border: "1px solid rgba(186, 177, 159, 0.18)",
              background: "var(--rs-surface-raised)",
              padding: isCompact ? 12 : "12px 14px",
              overflowX: "auto",
              boxShadow: "var(--rs-shadow-soft)",
            }}
          >
            {!isCompact && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(160px, 2fr) minmax(100px, 1fr) 72px 52px 78px 92px 72px 56px 88px minmax(100px, 1.1fr)",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--rs-on-surface-variant)",
                paddingBottom: 4,
                borderBottom: "1px solid rgba(186, 177, 159, 0.15)",
              }}
            >
              <div>Title</div>
              <div>Category</div>
              <div>Priority</div>
              <div>Hrs</div>
              <div>Due</div>
              <div>Status</div>
              <div>Outcome</div>
              <div>Domain</div>
              <div>Actions</div>
              <div>Tags</div>
            </div>
            )}
            {isCompact && (
              <p
                className="rs-backlog-compact-mobile-hint"
                style={{
                  fontSize: 12,
                  color: "var(--rs-on-surface-variant)",
                  margin: "0 0 10px",
                  lineHeight: 1.45,
                }}
              >
                On small screens, compact list shows as <strong>cards</strong> so task titles stay readable. Use{" "}
                <strong>Strategic</strong> for the full initiative cards.
              </p>
            )}
            <div>
              {sortedRootTasks.length === 0 ? (
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--rs-on-surface-variant)",
                    margin: isCompact ? "20px 0" : "12px 0 4px",
                    textAlign: "center",
                  }}
                >
                  No tasks match your filters.
                </p>
              ) : (
                sortedRootTasks.map((t) => renderTaskRow(t, 0))
              )}
            </div>
          </div>
        ) : (
          <div className="rs-backlog-card-list">
            {sortedRootTasks.length === 0 ? (
              <p
                style={{
                  fontSize: 14,
                  color: "var(--rs-on-surface-variant)",
                  margin: "24px 0",
                  textAlign: "center",
                }}
              >
                No tasks match your filters.
              </p>
            ) : (
              sortedRootTasks.map((t) => {
                const kids = (childrenByParent.get(t.id) || []).slice().sort((a, b) =>
                  String(a.title || "").localeCompare(String(b.title || ""), undefined, {
                    sensitivity: "base",
                  })
                );
                return (
                  <BacklogStrategicTaskCard
                    key={t.id}
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
                );
              })
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="rs-backlog-fab"
        onClick={() => openAddTaskModal()}
        aria-label="Add task"
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </DashboardLayout>
  );
}

