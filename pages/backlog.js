import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DashboardLayout from "../components/DashboardLayout";
import {
  getBacklogTasks,
  updateTaskStatusWithEvent,
  createTask,
  updateTask,
  setTaskTags,
  getCategoriesWithSubcategories,
  getAllTags,
} from "../lib/db";

const STATUS_FILTERS = [
  { value: "active", label: "Active (todo/doing/done)" },
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const [newTaskTitle, setNewTaskTitle] = useState("");

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

  const tasksById = useMemo(() => {
    const m = new Map();
    for (const t of tasks || []) {
      m.set(t.id, t);
    }
    return m;
  }, [tasks]);

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
      if (statusFilter === "active") {
        statusOk =
          t.status === "todo" || t.status === "doing" || t.status === "done";
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

  async function handleAddTask() {
    if (!user || !newTaskTitle.trim()) return;
    const res = await createTask(user.id, {
      title: newTaskTitle.trim(),
      status: "todo",
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const created = { ...res.data, _tagsText: "" };
    setTasks((prev) => [created, ...prev]);
    setNewTaskTitle("");
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

  if (loading && !user) {
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
              flex: "0 0 180px",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value || "");
              setSubcategoryFilter("");
            }}
            style={{
              flex: "0 0 180px",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={subcategoryFilter}
            onChange={(e) => setSubcategoryFilter(e.target.value || "")}
            style={{
              flex: "0 0 180px",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
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
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value || "")}
            style={{
              flex: "0 0 180px",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
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
        </div>

        <div
          style={{
            marginBottom: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Add new task…"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddTask();
              }
            }}
            style={{
              flex: 1,
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          />
          <button
            onClick={handleAddTask}
            style={{
              fontSize: 13,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Add task
          </button>
        </div>

        <div
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
    </DashboardLayout>
  );
}

