import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getIdeas,
  createIdea,
  promoteIdeaToTask,
} from "../lib/db";

export default function IdeasPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [promotingId, setPromotingId] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = () => {
      setLoading(true);
      setError("");
      getIdeas(user.id).then((res) => {
        if (cancelled) return;
        if (res.error) setError(res.error.message);
        else setIdeas(res.data || []);
        setLoading(false);
      });
    };
    const id = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [user]);

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
      setNewTitle("");
      setNewDetails("");
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
          Capture ideas and promote them to Business tasks.
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
            Ideas
          </h2>
          {ideas.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              No ideas yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {ideas.map((idea) => (
                <li
                  key={idea.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {idea.title}
                  </div>
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
                  {idea.status !== "promoted" && (
                    <button
                      onClick={() => handlePromote(idea.id)}
                      disabled={promotingId === idea.id}
                      style={{
                        marginTop: 6,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #059669",
                        background: "#ecfdf5",
                        color: "#059669",
                        fontSize: 12,
                        cursor: promotingId === idea.id ? "wait" : "pointer",
                      }}
                    >
                      {promotingId === idea.id
                        ? "Promoting…"
                        : "Promote to Task"}
                    </button>
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
