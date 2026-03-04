import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  getTemplates,
  setDefaultTemplate,
  getTemplateItems,
  updateTemplateOrder,
} from "../lib/db";

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
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Daily Templates</h1>
      {msg && <p style={{ color: "#666" }}>{msg}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTemplate(t.id)}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: t.id === activeTemplateId ? "#111" : "white",
              color: t.id === activeTemplateId ? "white" : "#111",
              cursor: "pointer",
            }}
          >
            {t.name} {t.is_default ? "⭐" : ""}
          </button>
        ))}
      </div>

      {activeTemplateId && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => makeDefault(activeTemplateId)}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "white",
              cursor: "pointer",
            }}
          >
            Set active as default
          </button>
        </div>
      )}

      <h2 style={{ marginTop: 20 }}>Items (drag to reorder)</h2>

      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableRow key={item.id} item={item} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
