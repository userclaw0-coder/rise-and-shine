import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  getTemplates,
  setDefaultTemplate,
  getTemplateItems,
  updateTemplateOrder,
} from "../lib/db";
import DashboardLayout from "../components/DashboardLayout";

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

function SortableRow({ item }) {
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div>
        <b>{item.task?.title}</b>{" "}
        <span style={{ color: "#666" }}>({item.task?.priority})</span>
      </div>
      <div style={{ color: "#999" }}>☰</div>
    </div>
  );
}

export default function TemplatesPage() {
  const [user, setUser] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      if (!u) window.location.href = "/login";
      setUser(u);
    });
  }, []);

  async function load() {
    setMsg("Loading...");
    const tRes = await getTemplates();
    if (tRes.error) return setMsg(tRes.error.message);

    setTemplates(tRes.data);
    const def = tRes.data.find((x) => x.is_default) || tRes.data[0];
    if (!def) return setMsg("No templates found.");

    setActiveTemplateId(def.id);

    const iRes = await getTemplateItems(def.id);
    if (iRes.error) return setMsg(iRes.error.message);

    setItems(iRes.data);
    setMsg("");
  }

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function switchTemplate(id) {
    setActiveTemplateId(id);
    const iRes = await getTemplateItems(id);
    if (iRes.error) return setMsg(iRes.error.message);
    setItems(iRes.data);
  }

  async function makeDefault(id) {
    setMsg("Setting default...");
    const res = await setDefaultTemplate(id);
    if (res.error) return setMsg(res.error.message);
    await load();
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
          Daily Templates
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
              <SortableRow key={item.id} item={item} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </DashboardLayout>
  );
}
