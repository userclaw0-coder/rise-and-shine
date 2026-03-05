import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import Modal from "../components/Modal";
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
} from "../lib/db";

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

function normalize(str) {
  return (str || "").toLowerCase();
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

export default function BacklogPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todo_doing");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalCategoryId, setModalCategoryId] = useState("");
  const [modalSubcategoryId, setModalSubcategoryId] = useState("");
  const [modalTagsText, setModalTagsText] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [tasksRes, catsRes, tagsRes] = await Promise.all([
          getBacklogTasks(user.id, { includeArchived: true }),
          getCategoriesWithSubcategories(user.id),
          getAllTags(user.id),
        ]);

        if (tasksRes.error) {
          setError(tasksRes.error.message);
        } else {
          const enriched =
            (tasksRes.data || []).map((t) => ({
              ...t,
              _tagsText: makeTagText(t),
            })) || [];
          setTasks(enriched);
        }

        if (!catsRes.error) {
          setCategories(catsRes.data || []);
        }

        if (!tagsRes.error) {
          setTags(tagsRes.data || []);
        }
      } catch (e) {
        setError(e.message || "Failed to load backlog.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

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

  const filteredRootTasks = useMemo(() => {
    const q = normalize(search);
    const tagNeedle = normalize(tagFilter);

    return rootTasks.filter((t) => {
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

      return titleMatch && statusOk && categoryOk && subcategoryOk && tagOk;
    });
  }, [
    rootTasks,
    search,
    statusFilter,
    categoryFilter,
    subcategoryFilter,
    tagFilter,
  ]);

  const [collapsedParents, setCollapsedParents] = useState({});

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

  function openAddTaskModal() {
    setModalTitle("");
    setModalCategoryId(categories[0]?.id ?? "");
    setModalSubcategoryId("");
    setModalTagsText("");
    setError("");
    setAddTaskOpen(true);
  }

  async function handleAddTaskFromModal() {
    if (!user || !modalTitle.trim()) return;
    const categoryId = modalCategoryId || categories[0]?.id;
    if (!categoryId) {
      setError("Create a category first (e.g. under Filter by).");
      return;
    }
    setAddingTask(true);
    setError("");
    const res = await createTask(user.id, {
      title: modalTitle.trim(),
      status: "todo",
      category_id: categoryId,
      subcategory_id: modalSubcategoryId || null,
    });
    if (res.error) {
      setError(res.error.message);
      setAddingTask(false);
      return;
    }
    const created = { ...res.data, _tagsText: modalTagsText };
    if (parseTagText(modalTagsText).length > 0) {
      const tagRes = await setTaskTags(user.id, res.data.id, parseTagText(modalTagsText));
      if (!tagRes.error) {
        created.tags = parseTagText(modalTagsText).map((name) => ({ name }));
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
    const created = { ...res.data, _tagsText: "" };
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

  function renderTaskRow(task, depth) {
    const children = childrenByParent.get(task.id) || [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedParents[task.id];

    const tagText = task._tagsText ?? makeTagText(task);

    return (
      <div key={task.id}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0, 3fr) minmax(0, 1.5fr) minmax(0, 1.1fr) 80px 120px 120px",
            gap: 8,
            alignItems: "center",
            padding: "6px 0",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: depth * 12 }} />
            {hasChildren && (
              <button
                onClick={() => toggleCollapsed(task.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 10,
                  color: "#6b7280",
                }}
              >
                {isCollapsed ? "▶" : "▼"}
              </button>
            )}
            {!hasChildren && depth > 0 && (
              <span style={{ fontSize: 10, color: "#d1d5db" }}>•</span>
            )}
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
                fontSize: 13,
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <select
              value={task.category_id || ""}
              onChange={(e) => {
                const cid = e.target.value || null;
                updateTaskLocal(task.id, {
                  category_id: cid,
                  subcategory_id: null,
                });
                handleInlineSave(task.id, { category_id: cid, subcategory_id: null });
              }}
              style={{
                flex: 1,
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 999,
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
            <select
              value={task.subcategory_id || ""}
              onChange={(e) => {
                const sid = e.target.value || null;
                updateTaskLocal(task.id, { subcategory_id: sid });
                handleInlineSave(task.id, { subcategory_id: sid });
              }}
              style={{
                flex: 1,
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="">Subcategory…</option>
              {categories
                .find((c) => c.id === task.category_id)
                ?.subcategories?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <select
              value={task.priority || "Medium"}
              onChange={(e) =>
                handleInlineSave(task.id, { priority: e.target.value })
              }
              style={{
                flex: 1,
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 999,
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
                width: 60,
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 6,
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
              fontSize: 12,
              padding: "3px 6px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <select
              value={task.status || "todo"}
              onChange={(e) => handleStatusChange(task, e.target.value)}
              style={{
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <option value="todo">Todo</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
              <option value="archived">Archived</option>
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => handleAddSubtask(task)}
                style={{
                  flex: 1,
                  fontSize: 11,
                  padding: "2px 4px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                + Subtask
              </button>
              {task.status === "archived" ? (
                <button
                  onClick={() => handleStatusChange(task, "todo")}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: "2px 4px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#ecfdf3",
                    cursor: "pointer",
                  }}
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange(task, "archived")}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: "2px 4px",
                    borderRadius: 999,
                    border: "1px solid #fee2e2",
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

          <div>
            <input
              type="text"
              value={tagText}
              onChange={(e) =>
                updateTaskLocal(task.id, { _tagsText: e.target.value })
              }
              onBlur={(e) => handleTagsSave(task.id, e.target.value)}
              placeholder="tags (comma separated)"
              style={{
                width: "100%",
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            />
            <div
              style={{
                marginTop: 2,
                fontSize: 10,
                color: "#9ca3af",
              }}
            >
              Use tags like: quick-win, high-leverage, urgent, blocked, waiting
            </div>
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
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
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
              Backlog
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              Manage non-daily tasks, tags, and subtasks.
            </p>
          </div>
        </div>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>
            {error}
          </p>
        )}

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
            Show:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter("todo_doing")}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: statusFilter === "todo_doing" ? "#111827" : "#e5e7eb",
              background: statusFilter === "todo_doing" ? "#111827" : "#ffffff",
              color: statusFilter === "todo_doing" ? "#ffffff" : "#111827",
              cursor: "pointer",
            }}
          >
            Todo & Doing
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("done")}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: statusFilter === "done" ? "#059669" : "#e5e7eb",
              background: statusFilter === "done" ? "#059669" : "#ffffff",
              color: statusFilter === "done" ? "#ffffff" : "#059669",
              cursor: "pointer",
            }}
          >
            Completed
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("archived")}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: statusFilter === "archived" ? "#6b7280" : "#e5e7eb",
              background: statusFilter === "archived" ? "#6b7280" : "#ffffff",
              color: statusFilter === "archived" ? "#ffffff" : "#6b7280",
              cursor: "pointer",
            }}
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
            Category:
          </span>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("");
              setSubcategoryFilter("");
            }}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: !categoryFilter ? "#111827" : "#e5e7eb",
              background: !categoryFilter ? "#111827" : "#ffffff",
              color: !categoryFilter ? "#ffffff" : "#111827",
              cursor: "pointer",
            }}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategoryFilter(c.id);
                setSubcategoryFilter("");
              }}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 999,
                border: "1px solid",
                borderColor: categoryFilter === c.id ? "#111827" : "#e5e7eb",
                background: categoryFilter === c.id ? "#111827" : "#ffffff",
                color: categoryFilter === c.id ? "#ffffff" : "#111827",
                cursor: "pointer",
              }}
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
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <input
            type="text"
            placeholder="Search title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 180px",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              flex: "0 0 160px",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
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

        <div
          style={{
            marginBottom: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={openAddTaskModal}
            style={{
              fontSize: 14,
              padding: "10px 18px",
              minHeight: 44,
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            + Add task
          </button>
        </div>

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
                  setModalSubcategoryId("");
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
              <select
                value={modalSubcategoryId}
                onChange={(e) => setModalSubcategoryId(e.target.value || "")}
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <option value="">None</option>
                {(categories.find((c) => c.id === modalCategoryId)?.subcategories || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
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

        <div className="backlog-table-wrap">
          <div
            className="backlog-table-inner"
            style={{
              marginTop: 6,
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 3fr) minmax(0, 1.5fr) minmax(0, 1.1fr) 80px 120px 120px",
                gap: 8,
                fontSize: 11,
                fontWeight: 500,
                color: "#6b7280",
                paddingBottom: 4,
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <div>Title / hierarchy</div>
              <div>Category / subcategory</div>
              <div>Priority / effort</div>
              <div>Due</div>
              <div>Status / actions</div>
              <div>Tags</div>
            </div>

            <div>
              {filteredRootTasks.length === 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    margin: "8px 0 4px",
                  }}
                >
                  No tasks match your filters.
                </p>
              ) : (
                filteredRootTasks.map((t) => renderTaskRow(t, 0))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

