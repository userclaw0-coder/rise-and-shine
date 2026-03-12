import { useEffect, useState, useRef } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { getNotes, createNote, updateNote } from "../lib/db";

function formatDayAndTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} · ${timeStr}`;
}

function AutoHeightText({ value, readOnly, onChange, placeholder, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(60, el.scrollHeight)}px`;
  }, [value]);
  if (readOnly) {
    return (
      <div
        ref={ref}
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: 24,
          ...style,
        }}
      >
        {value || "\u00a0"}
      </div>
    );
  }
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{
        width: "100%",
        resize: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function isNotesTableMissing(message) {
  if (!message || typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the table") ||
    lower.includes("public.notes") ||
    lower.includes("schema cache")
  );
}

const NOTES_TABLE_MESSAGE =
  "The notes table doesn't exist in your database yet. In Supabase Dashboard → SQL Editor, run the script in docs/NOTES_TABLE.sql to create it (and RLS policies).";

export default function NotesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError("");
    getNotes(user.id)
      .then((res) => {
        if (res.error) {
          setError(
            isNotesTableMissing(res.error.message) ? NOTES_TABLE_MESSAGE : res.error.message
          );
        } else setNotes(res.data || []);
      })
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSave() {
    if (!user || !body.trim()) return;
    setSaving(true);
    setError("");
    const res = await createNote(user.id, { title: title.trim() || null, body: body.trim() });
    if (res.error) {
      setError(
        isNotesTableMissing(res.error.message) ? NOTES_TABLE_MESSAGE : res.error.message
      );
    } else {
      setNotes((prev) => [res.data, ...prev]);
      setTitle("");
      setBody("");
    }
    setSaving(false);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditTitle(note.title || "");
    setEditBody(note.body || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
  }

  async function saveEdit() {
    if (!user || editingId == null) return;
    setSaving(true);
    setError("");
    const res = await updateNote(user.id, editingId, { title: editTitle.trim() || null, body: editBody });
    if (res.error) {
      setError(
        isNotesTableMissing(res.error.message) ? NOTES_TABLE_MESSAGE : res.error.message
      );
    } else {
      setNotes((prev) => prev.map((n) => (n.id === editingId ? { ...n, ...res.data } : n)));
      cancelEdit();
    }
    setSaving(false);
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
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Notes
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Add notes anytime; multiple per day. Optional title, day and time saved automatically.
        </p>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>
        )}

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
            New note
          </h2>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
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
          <AutoHeightText
            value={body}
            onChange={setBody}
            placeholder="What's on your mind?"
            style={{
              padding: 10,
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
          <button
            onClick={handleSave}
            disabled={!body.trim() || saving}
            style={{
              marginTop: 8,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontSize: 13,
              cursor: body.trim() && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </section>

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
            Recent notes
          </h2>
          {notes.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              No notes yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {notes.map((n) => (
                <li
                  key={n.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  {editingId === n.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title (optional)"
                        style={{
                          padding: "6px 8px",
                          fontSize: 13,
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                        }}
                      />
                      <AutoHeightText
                        value={editBody}
                        onChange={setEditBody}
                        style={{
                          padding: 8,
                          fontSize: 13,
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={saving}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #111827",
                            background: "#111827",
                            color: "#fff",
                            fontSize: 12,
                            cursor: saving ? "wait" : "pointer",
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
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                        {formatDayAndTime(n.created_at)}
                      </div>
                      {n.title && (
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                          {n.title}
                        </div>
                      )}
                      <AutoHeightText
                        value={n.body || ""}
                        readOnly
                        style={{
                          fontSize: 13,
                          color: "#374151",
                          marginBottom: 8,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => startEdit(n)}
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
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
