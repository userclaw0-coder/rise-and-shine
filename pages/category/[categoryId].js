import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import DashboardLayout from "../../components/DashboardLayout";
import { useAuth } from "../../hooks/useAuth";
import { getBacklogTasks, getCategoriesWithSubcategories, getUserProfile, upsertUserProfile } from "../../lib/db";

function SortableTaskRow({ task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const isSubtask = !!task.parent_task_id;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        opacity: isDragging ? 0.8 : 1,
        marginLeft: isSubtask ? 18 : 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isSubtask ? "↳ " : ""}{task.title}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
          {task._parentTitle ? `Parent: ${task._parentTitle} • ` : ""}
          {task.priority || "n/a"}{task.due_date ? ` • due ${String(task.due_date).slice(0, 10)}` : ""}{task.status ? ` • ${task.status}` : ""}
        </div>
      </div>
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          color: "#9ca3af",
          fontSize: 18,
          padding: "0 6px",
          userSelect: "none",
        }}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ☰
      </div>
    </div>
  );
}

export default function CategoryPage() {
  const router = useRouter();
  const { categoryId } = router.query;
  const { user, isCheckingAuth } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [tasks, setTasks] = useState([]);

  const [projectLinks, setProjectLinks] = useState("");
  const [savingLinks, setSavingLinks] = useState(false);

  const [orderIds, setOrderIds] = useState([]);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (!user || !categoryId) return;

    async function load() {
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
        setTasks(inCat);

        const prefs = profileRes?.data?.profile?.preferences || {};
        const linksMap = prefs.category_project_links || {};
        const orderMap = prefs.category_task_order_ids || {};
        setProjectLinks(String(linksMap[String(categoryId)] || ""));
        const serverOrder = Array.isArray(orderMap[String(categoryId)]) ? orderMap[String(categoryId)] : [];
        setOrderIds(serverOrder.filter(Boolean));
      } catch (e) {
        setError(e.message || "Failed to load category.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, categoryId]);

  const categoryOptions = useMemo(() => {
    return (categories || [])
      .map((c) => ({ id: c.id, name: c.name }))
      .filter((c) => c.id && c.name)
      .sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
      );
  }, [categories]);

  const parentTitleById = useMemo(() => {
    const m = new Map();
    for (const t of tasks || []) {
      if (t?.id && t?.title) m.set(t.id, t.title);
    }
    return m;
  }, [tasks]);

  const orderedTasks = useMemo(() => {
    const byId = new Map((tasks || []).map((t) => [t.id, t]));
    const inOrder = (orderIds || []).map((id) => byId.get(id)).filter(Boolean);
    const remaining = (tasks || []).filter((t) => !(orderIds || []).includes(t.id));
    return [...inOrder, ...remaining];
  }, [tasks, orderIds]);

  async function handleSaveProjectLinks() {
    if (!user || !categoryId) return;
    setSavingLinks(true);
    setError("");
    try {
      const res = await getUserProfile(user.id);
      const existing = res?.data?.profile || {};
      const prefs = { ...(existing.preferences || {}) };
      const map = { ...(prefs.category_project_links || {}) };
      map[String(categoryId)] = String(projectLinks || "");
      const up = await upsertUserProfile(user.id, { ...existing, preferences: { ...prefs, category_project_links: map } });
      if (up.error) setError(up.error.message || "Failed to save links.");
    } finally {
      setSavingLinks(false);
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = orderedTasks.map((t) => t.id);
    const oldIndex = current.indexOf(active.id);
    const newIndex = current.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = arrayMove(current, oldIndex, newIndex);
    setOrderIds(nextIds);

    // Persist (best effort)
    setSavingOrder(true);
    setError("");
    try {
      const res = await getUserProfile(user.id);
      const existing = res?.data?.profile || {};
      const prefs = { ...(existing.preferences || {}) };
      const map = { ...(prefs.category_task_order_ids || {}) };
      map[String(categoryId)] = nextIds;
      const up = await upsertUserProfile(user.id, { ...existing, preferences: { ...prefs, category_task_order_ids: map } });
      if (up.error) setError(up.error.message || "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  }

  if (isCheckingAuth || !user || loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>
              {category?.name || "Category"}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              Drag to reorder tasks in this category. Subtasks are shown and can be reordered too.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={String(categoryId || "")}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                router.push(`/category/${id}`);
              }}
              style={{
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                cursor: "pointer",
                minWidth: 240,
              }}
            >
              {categoryOptions.length === 0 ? (
                <option value={String(categoryId || "")}>Category pages…</option>
              ) : (
                categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => router.push("/backlog")}
              style={{
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                cursor: "pointer",
                color: "#111827",
              }}
            >
              Action Items
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{error}</p>
        )}

        <section
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Project Links</h2>
            <button
              type="button"
              onClick={handleSaveProjectLinks}
              disabled={savingLinks}
              style={{
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#ffffff",
                cursor: savingLinks ? "wait" : "pointer",
                opacity: savingLinks ? 0.8 : 1,
              }}
            >
              {savingLinks ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea
            value={projectLinks}
            onChange={(e) => setProjectLinks(e.target.value)}
            placeholder="Paste links to Google Drive folders, docs, project boards, external AI conversations, etc."
            rows={6}
            style={{
              marginTop: 10,
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 13,
              resize: "vertical",
            }}
          />
        </section>

        <section
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
              Tasks ({orderedTasks.length})
            </h2>
            {savingOrder && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>Saving order…</span>
            )}
          </div>

          {orderedTasks.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: "10px 0 0" }}>
              No tasks found in this category.
            </p>
          ) : (
            <div style={{ marginTop: 12 }}>
              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {orderedTasks.map((t) => (
                      <SortableTaskRow
                        key={t.id}
                        task={{
                          ...t,
                          _parentTitle:
                            t.parent_task_id && parentTitleById.get(t.parent_task_id)
                              ? parentTitleById.get(t.parent_task_id)
                              : null,
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

