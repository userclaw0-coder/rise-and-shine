import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getDailyNotes,
  getDailyNoteForDate,
  upsertDailyNote,
} from "../lib/db";

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function NotesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]);
  const [todayNote, setTodayNote] = useState("");
  const [todayDirty, setTodayDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const todayStr = todayDateStr();

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [listRes, todayRes] = await Promise.all([
          getDailyNotes(user.id),
          getDailyNoteForDate(user.id, todayStr),
        ]);
        if (listRes.error) setError(listRes.error.message);
        else setNotes(listRes.data || []);
        if (!todayRes.error && todayRes.data) {
          setTodayNote(todayRes.data.note || "");
        } else {
          setTodayNote("");
        }
      } catch (e) {
        setError(e.message || "Failed to load notes.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, todayStr]);

  async function saveTodayNote() {
    if (!user || !todayDirty) return;
    setSaving(true);
    setError("");
    const res = await upsertDailyNote(user.id, todayStr, todayNote);
    if (res.error) setError(res.error.message);
    else {
      setTodayDirty(false);
      setNotes((prev) => {
        const without = prev.filter((n) => n.date !== todayStr);
        return [{ ...res.data, date: todayStr }, ...without];
      });
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
          Daily notes. Edit today&apos;s note below.
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
            Note for today ({todayStr})
          </h2>
          <textarea
            value={todayNote}
            onChange={(e) => {
              setTodayNote(e.target.value);
              setTodayDirty(true);
            }}
            placeholder="What's on your mind?"
            rows={6}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={saveTodayNote}
            disabled={!todayDirty || saving}
            style={{
              marginTop: 8,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontSize: 13,
              cursor: todayDirty && !saving ? "pointer" : "not-allowed",
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
                  key={n.id || n.date}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: 13,
                  }}
                >
                  <strong>{n.date}</strong>
                  {n.note ? (
                    <div
                      style={{
                        marginTop: 4,
                        color: "#374151",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {n.note.slice(0, 200)}
                      {n.note.length > 200 ? "…" : ""}
                    </div>
                  ) : (
                    <span style={{ color: "#9ca3af", marginLeft: 6 }}>—</span>
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
