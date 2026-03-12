import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getIdeas,
  createIdea,
  promoteIdeaToTask,
  updateIdea,
  archiveIdea,
  getUserProfile,
  upsertUserProfile,
} from "../lib/db";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableIdeaItem({
  idea,
  editingId,
  editTitle,
  setEditTitle,
  editDetails,
  setEditDetails,
  startEdit,
  cancelEdit,
  saveEdit,
  handlePromote,
  handleArchive,
  promotingId,
  archivingId,
  showArchived,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: idea.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px 0",
    borderBottom: "1px solid #f3f4f6",
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {!showArchived && (
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: "grab",
              color: "#9ca3af",
              fontSize: 14,
              paddingTop: 2,
              flexShrink: 0,
            }}
            title="Drag to reorder"
          >
            ☰
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingId === idea.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                style={{
                  padding: "6px 8px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                }}
              />
              <textarea
                value={editDetails}
                onChange={(e) => setEditDetails(e.target.value)}
                placeholder="Details (optional)"
                rows={3}
                style={{
                  padding: "6px 8px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={saveEdit}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{idea.title}</div>
              {idea.details && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    marginTop: 4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {idea.details}
                </div>
              )}
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#9ca3af",
                }}
              >
                {idea.status || "open"}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {idea.status !== "promoted" && (
                  <button
                    onClick={() => handlePromote(idea.id)}
                    disabled={promotingId === idea.id}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #059669",
                      background: "#ecfdf5",
                      color: "#059669",
                      fontSize: 12,
                      cursor: promotingId === idea.id ? "wait" : "pointer",
                    }}
                  >
                    {promotingId === idea.id ? "Promoting…" : "Promote to Task"}
                  </button>
                )}
                {!showArchived && idea.status !== "archived" && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(idea)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #6b7280",
                        background: "#fff",
                        color: "#4b5563",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(idea.id)}
                      disabled={archivingId === idea.id}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #9ca3af",
                        background: "#f9fafb",
                        color: "#6b7280",
                        fontSize: 12,
                        cursor: archivingId === idea.id ? "wait" : "pointer",
                      }}
                    >
                      {archivingId === idea.id ? "Archiving…" : "Archive"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default function IdeasPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [ideaOrder, setIdeaOrder] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [promotingId, setPromotingId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetails, setEditDetails] = useState("");

  function loadIdeas() {
    if (!user) return;
    setLoading(true);
    setError("");
    Promise.all([
      getIdeas(user.id, { archivedOnly: showArchived }),
      showArchived ? Promise.resolve({ data: null }) : getUserProfile(user.id),
    ])
      .then(([ideasRes, profileRes]) => {
        if (ideasRes.error) {
          setError(ideasRes.error.message);
          return;
        }
        setIdeas(ideasRes.data || []);
        if (!showArchived && profileRes && !profileRes.error && profileRes.data?.profile) {
          setIdeaOrder(Array.isArray(profileRes.data.profile.idea_order) ? profileRes.data.profile.idea_order : []);
        } else if (showArchived) {
          setIdeaOrder([]);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    loadIdeas();
  }, [user, showArchived]);

  const orderedIdeas = useMemo(() => {
    if (showArchived) return ideas;
    const order = ideaOrder;
    const inOrder = order.map((id) => ideas.find((i) => i.id === id)).filter(Boolean);
    const notInOrder = ideas.filter((i) => !order.includes(i.id));
    return [...inOrder, ...notInOrder];
  }, [ideas, ideaOrder, showArchived]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIdeas.findIndex((i) => i.id === active.id);
    const newIndex = orderedIdeas.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(orderedIdeas, oldIndex, newIndex);
    const newOrder = reordered.map((i) => i.id);
    setIdeaOrder(newOrder);
    const profileRes = await getUserProfile(user.id);
    const existing = profileRes?.data?.profile || {};
    const res = await upsertUserProfile(user.id, { ...existing, idea_order: newOrder });
    if (res.error) setError(res.error.message || "Failed to save order.");
  }

  async function handleCreate() {
    if (!user || !newTitle.trim()) return;
    setError("");
    const res = await createIdea(user.id, {
      title: newTitle.trim(),
      details: newDetails.trim() || null,
    });
    if (res.error) setError(res.error.message);
    else {
      setIdeas((prev) => [res.data, ...prev]);
      setIdeaOrder((prev) => [res.data.id, ...prev]);
      setNewTitle("");
      setNewDetails("");
      const profileRes = await getUserProfile(user.id);
      const existing = profileRes?.data?.profile || {};
      upsertUserProfile(user.id, { ...existing, idea_order: [res.data.id, ...(ideaOrder || [])] }).then(() => {});
    }
  }

  async function handlePromote(ideaId) {
    if (!user) return;
    setPromotingId(ideaId);
    setError("");
    const res = await promoteIdeaToTask(user.id, ideaId);
    if (res.error) setError(res.error.message);
    else {
      setIdeas((prev) =>
        prev.map((i) => (i.id === ideaId ? { ...i, status: "promoted" } : i))
      );
    }
    setPromotingId(null);
  }

  function startEdit(idea) {
    setEditingId(idea.id);
    setEditTitle(idea.title || "");
    setEditDetails(idea.details || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDetails("");
  }

  async function saveEdit() {
    if (!user || editingId == null) return;
    setError("");
    const res = await updateIdea(user.id, editingId, {
      title: editTitle.trim() || "",
      details: editDetails.trim() || null,
    });
    if (res.error) setError(res.error.message);
    else {
      setIdeas((prev) => prev.map((i) => (i.id === editingId ? { ...i, ...res.data } : i)));
      cancelEdit();
    }
  }

  async function handleArchive(ideaId) {
    if (!user) return;
    setArchivingId(ideaId);
    setError("");
    const res = await archiveIdea(user.id, ideaId);
    if (res.error) setError(res.error.message);
    else setIdeas((prev) => prev.filter((i) => i.id !== ideaId));
    setArchivingId(null);
  }

  if (loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
      </DashboardLayout>
    );
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
          Ideas
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Capture ideas and promote them to tasks. Edit or archive any idea.
        </p>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #6b7280",
              background: showArchived ? "#374151" : "#fff",
              color: showArchived ? "#fff" : "#374151",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {showArchived ? "Back to active ideas" : "View archived ideas"}
          </button>
        </div>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>
        )}

        {!showArchived && (
          <section
            style={{
              marginTop: 20,
              padding: 16,
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
              New idea
            </h2>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            <textarea
              value={newDetails}
              onChange={(e) => setNewDetails(e.target.value)}
              placeholder="Details (optional)"
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              style={{
                marginTop: 6,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                fontSize: 13,
                cursor: newTitle.trim() ? "pointer" : "not-allowed",
              }}
            >
              Add idea
            </button>
          </section>
        )}

        <section
          style={{
            marginTop: 24,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            {showArchived ? "Archived ideas" : "Ideas"}
          </h2>
          {orderedIdeas.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              {showArchived ? "No archived ideas." : "No ideas yet."}
            </p>
          ) : showArchived ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {orderedIdeas.map((idea) => (
                <SortableIdeaItem
                  key={idea.id}
                  idea={idea}
                  editingId={editingId}
                  editTitle={editTitle}
                  setEditTitle={setEditTitle}
                  editDetails={editDetails}
                  setEditDetails={setEditDetails}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  saveEdit={saveEdit}
                  handlePromote={handlePromote}
                  handleArchive={handleArchive}
                  promotingId={promotingId}
                  archivingId={archivingId}
                  showArchived={showArchived}
                />
              ))}
            </ul>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={orderedIdeas.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {orderedIdeas.map((idea) => (
                    <SortableIdeaItem
                      key={idea.id}
                      idea={idea}
                      editingId={editingId}
                      editTitle={editTitle}
                      setEditTitle={setEditTitle}
                      editDetails={editDetails}
                      setEditDetails={setEditDetails}
                      startEdit={startEdit}
                      cancelEdit={cancelEdit}
                      saveEdit={saveEdit}
                      handlePromote={handlePromote}
                      handleArchive={handleArchive}
                      promotingId={promotingId}
                      archivingId={archivingId}
                      showArchived={showArchived}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
