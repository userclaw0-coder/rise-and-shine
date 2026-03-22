import { useEffect, useMemo, useState } from "react";
import {
  getTemplates,
  setDefaultTemplate,
  getTemplateItems,
  updateTemplateOrder,
  getDailyRepeatTasksNotInTemplate,
  getOrCreateDailyRepeatCategory,
  addTemplateItem,
  removeTemplateItem,
  createTask,
  updateTask,
  setTaskTags,
} from "../lib/db";
import DashboardLayout from "../components/DashboardLayout";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";

import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";

import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

function SortableRow({ item, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "10px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    marginBottom: "8px",
    background: "white",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        <div {...attributes} {...listeners} style={{ cursor: "grab", color: "#999" }}>☰</div>
        <div>
          <b>{item.task?.title}</b>{" "}
          <span style={{ color: "#666" }}>({item.task?.priority})</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(item)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              color: "#111827",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [items, setItems] = useState([]);
  const [addableTasks, setAddableTasks] = useState([]);
  const [newEntryTitle, setNewEntryTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState("Medium");
  const [editStatus, setEditStatus] = useState("todo");
  const [editDueDate, setEditDueDate] = useState("");
  const [editEffortHours, setEditEffortHours] = useState("");
  const [editTagsText, setEditTagsText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  function parseTagText(text) {
    return (text || "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  async function load() {
    setMsg("Loading...");
    const tRes = await getTemplates();
    if (tRes.error) return setMsg(tRes.error.message);

    setTemplates(tRes.data || []);
    const def = (tRes.data || []).find((x) => x.is_default) || tRes.data?.[0];
    if (!def) return setMsg("No templates found.");

    setActiveTemplateId(def.id);

    const iRes = await getTemplateItems(def.id);
    if (iRes.error) return setMsg(iRes.error.message);
    setItems(iRes.data || []);

    if (user) {
      const aRes = await getDailyRepeatTasksNotInTemplate(user.id, def.id);
      setAddableTasks(aRes.data || []);
    }
    setMsg("");
  }

  useEffect(() => {
    if (!user) return;
    const id = setTimeout(() => load(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load depends on user, run once when user is set
  }, [user]);

  useEffect(() => {
    if (!user || !activeTemplateId) return;
    getDailyRepeatTasksNotInTemplate(user.id, activeTemplateId).then((res) => {
      setAddableTasks(res.data || []);
    });
  }, [user, activeTemplateId, items]);

  async function handleAddTask() {
    const title = (newEntryTitle || "").trim();
    if (!title || !activeTemplateId || !user) return;
    setMsg("Adding…");
    const catRes = await getOrCreateDailyRepeatCategory(user.id);
    if (catRes.error) {
      setMsg(catRes.error.message || "Could not get Daily Repeat category.");
      return;
    }
    const taskRes = await createTask(user.id, {
      title,
      category_id: catRes.data,
      status: "todo",
      priority: "Medium",
    });
    if (taskRes.error) {
      setMsg(taskRes.error.message || "Could not create task.");
      return;
    }
    const res = await addTemplateItem(user.id, activeTemplateId, taskRes.data.id);
    if (res.error) setMsg(res.error.message);
    else {
      setNewEntryTitle("");
      const iRes = await getTemplateItems(activeTemplateId);
      if (!iRes.error) setItems(iRes.data || []);
      if (user) {
        const aRes = await getDailyRepeatTasksNotInTemplate(user.id, activeTemplateId);
        setAddableTasks(aRes.data || []);
      }
      setMsg("");
    }
  }

  async function handleRemoveItem(itemId) {
    setMsg("Removing…");
    const res = await removeTemplateItem(itemId);
    if (res.error) setMsg(res.error.message);
    else {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      if (user && activeTemplateId) {
        const aRes = await getDailyRepeatTasksNotInTemplate(user.id, activeTemplateId);
        setAddableTasks(aRes.data || []);
      }
      setMsg("");
    }
  }

  function openEditItem(item) {
    const task = item?.task || {};
    setEditingTaskId(task?.id || null);
    setEditTitle(task?.title || "");
    setEditPriority(task?.priority || "Medium");
    setEditStatus(task?.status || "todo");
    setEditDueDate(task?.due_date ? String(task.due_date).slice(0, 10) : "");
    setEditEffortHours(task?.effort_hours != null ? String(task.effort_hours) : "");
    setEditTagsText(extractTagNames(task).join(", "));
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!user || !editingTaskId || !String(editTitle || "").trim()) return;
    setSavingEdit(true);
    setMsg("Saving…");
    try {
      const upd = await updateTask(user.id, editingTaskId, {
        title: String(editTitle || "").trim(),
        priority: editPriority || "Medium",
        due_date: editDueDate || null,
        effort_hours: editEffortHours === "" ? null : Number(editEffortHours),
      });
      if (upd.error) {
        setMsg(upd.error.message || "Could not update item.");
        return;
      }
      const st = await updateTask(user.id, editingTaskId, {
        status: editStatus || "todo",
      });
      if (st.error) {
        setMsg(st.error.message || "Could not update status.");
        return;
      }
      const tagsRes = await setTaskTags(user.id, editingTaskId, parseTagText(editTagsText));
      if (tagsRes.error) {
        setMsg(tagsRes.error.message || "Could not update tags.");
        return;
      }
      if (activeTemplateId) {
        const iRes = await getTemplateItems(activeTemplateId);
        if (!iRes.error) setItems(iRes.data || []);
      }
      setEditOpen(false);
      setEditingTaskId(null);
      setMsg("");
    } finally {
      setSavingEdit(false);
    }
  }

  async function switchTemplate(id) {
    setActiveTemplateId(id);
    const iRes = await getTemplateItems(id);
    if (iRes.error) return setMsg(iRes.error.message);
    setItems(iRes.data || []);
    if (user) {
      const aRes = await getDailyRepeatTasksNotInTemplate(user.id, id);
      setAddableTasks(aRes.data || []);
      setNewEntryTitle("");
    }
  }

  async function makeDefault(id) {
    setMsg("Setting default...");
    const res = await setDefaultTemplate(id);
    if (res.error) {
      setMsg(res.error.message);
      return;
    }
    const tRes = await getTemplates();
    if (!tRes.error) setTemplates(tRes.data || []);
    setMsg("");
  }

  const ids = useMemo(() => items.map((x) => x.id), [items]);

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const newItems = arrayMove(items, oldIndex, newIndex);

    // update local immediately
    setItems(newItems);

    // persist new sort_order
    const payload = newItems.map((it, idx) => ({
      id: it.id,
      sort_order: idx,
    }));
    const res = await updateTemplateOrder(payload);
    if (res.error) setMsg(res.error.message);
  }

  return (
    <DashboardLayout>
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Daily Hits
        </h1>
        {msg && (
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>{msg}</p>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 16,
            marginBottom: 8,
          }}
        >
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTemplate(t.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: t.id === activeTemplateId ? "#111827" : "white",
                color: t.id === activeTemplateId ? "white" : "#111827",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {t.name} {t.is_default ? "⭐" : ""}
            </button>
          ))}
        </div>

        {activeTemplateId && (
          <div style={{ marginTop: 4, marginBottom: 16 }}>
            <button
              onClick={() => makeDefault(activeTemplateId)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "white",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Set active as default
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            Add Daily Hit:
            <input
              type="text"
              value={newEntryTitle}
              onChange={(e) => setNewEntryTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
              placeholder="Enter new entry name"
              style={{
                marginLeft: 6,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 13,
                minWidth: 180,
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleAddTask}
            disabled={!newEntryTitle.trim()}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontSize: 13,
              cursor: newEntryTitle.trim() ? "pointer" : "not-allowed",
            }}
          >
            Add
          </button>
        </div>

        <h2
          style={{
            marginTop: 8,
            marginBottom: 10,
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Items (drag to reorder)
        </h2>

        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                onEdit={openEditItem}
                onRemove={handleRemoveItem}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <Modal
        title="Edit Daily Hit"
        open={editOpen}
        onClose={() => !savingEdit && setEditOpen(false)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
            Title
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
            />
          </label>
          <div className="rs-form-grid-2">
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Priority
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff" }}
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Status
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff" }}
              >
                <option value="todo">todo</option>
                <option value="doing">doing</option>
                <option value="done">done</option>
                <option value="archived">archived</option>
              </select>
            </label>
          </div>
          <div className="rs-form-grid-2">
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Due date
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Effort hours
              <input
                type="number"
                step="0.25"
                value={editEffortHours}
                onChange={(e) => setEditEffortHours(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
              />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
            Tags (comma separated)
            <input
              type="text"
              value={editTagsText}
              onChange={(e) => setEditTagsText(e.target.value)}
              placeholder="e.g. quick-win, urgent"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={savingEdit}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                cursor: savingEdit ? "not-allowed" : "pointer",
                color: "#111827",
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={savingEdit || !String(editTitle || "").trim()}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                cursor: savingEdit || !String(editTitle || "").trim() ? "not-allowed" : "pointer",
                color: "#ffffff",
                fontSize: 13,
                opacity: savingEdit || !String(editTitle || "").trim() ? 0.8 : 1,
              }}
            >
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
