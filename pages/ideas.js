import { useCallback, useEffect, useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { useRouter } from "next/router";
import {
  getIdeas,
  createIdea,
  updateIdea,
  archiveIdea,
  promoteIdeaToTask,
  promoteIdeaToProject,
} from "../lib/db";
import { supabase } from "../lib/supabaseClient";

const SCORE_DIMS = [
  { id: "alignment", label: "Alignment", color: "var(--ps-sage)" },
  { id: "leverage", label: "Leverage", color: "var(--ps-accent)" },
  { id: "feasibility", label: "Feasibility", color: "var(--ps-indigo)" },
  { id: "novelty", label: "Novelty", color: "var(--ps-plum)" },
  { id: "timing", label: "Timing", color: "var(--ps-gold)" },
  { id: "heat", label: "Heat", color: "var(--ps-clay)" },
];

const STAGES = [
  { id: "new", label: "Raw sparks", sub: "Just captured", color: "var(--ps-ink-50)" },
  { id: "shaping", label: "Shaping", sub: "Iterating + validating", color: "var(--ps-indigo)" },
  { id: "promoted", label: "Promoted", sub: "Turned into a task", color: "var(--ps-sage)" },
  { id: "archived", label: "Archived", sub: "Parked for later", color: "var(--ps-ink-30)" },
];

function statusToStage(status) {
  if (status === "archived") return "archived";
  if (status === "promoted") return "promoted";
  if (status === "shaping") return "shaping";
  return "new";
}

export default function IdeasPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("board");
  const [selectedId, setSelectedId] = useState(null);
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureDetails, setCaptureDetails] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [scoring, setScoring] = useState(null);
  const [scoreError, setScoreError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    const res = await getIdeas(user.id, { includeArchived: true });
    if (res.error) setError(res.error.message);
    else setIdeas(res.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = ideas.find((i) => i.id === selectedId) || null;

  useEffect(() => {
    if (selectedId && selected) {
      setEditTitle(selected.title || "");
      setEditDetails(selected.details || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? ideas.filter(
          (i) =>
            (i.title || "").toLowerCase().includes(q) ||
            (i.details || "").toLowerCase().includes(q)
        )
      : ideas;
    const out = Object.fromEntries(STAGES.map((s) => [s.id, []]));
    for (const i of filtered) {
      const stage = statusToStage(i.status);
      if (out[stage]) out[stage].push(i);
    }
    return out;
  }, [ideas, search]);

  async function handleCapture() {
    if (!user || !captureTitle.trim() || capturing) return;
    setCapturing(true);
    const res = await createIdea(user.id, {
      title: captureTitle.trim(),
      details: captureDetails.trim() || null,
      status: "new",
    });
    if (!res.error && res.data) {
      setIdeas((l) => [res.data, ...l]);
      setSelectedId(res.data.id);
    }
    setCaptureTitle("");
    setCaptureDetails("");
    setCapturing(false);
  }

  async function setStatus(idea, nextStatus) {
    setBusy(idea.id);
    const res = await updateIdea(user.id, idea.id, { status: nextStatus });
    if (!res.error && res.data) {
      setIdeas((l) =>
        l.map((x) => (x.id === idea.id ? { ...x, status: nextStatus } : x))
      );
    }
    setBusy("");
  }

  async function handleArchive(idea) {
    if (!window.confirm("Archive this idea?")) return;
    setBusy(idea.id);
    const res = await archiveIdea(user.id, idea.id);
    if (!res.error)
      setIdeas((l) =>
        l.map((x) => (x.id === idea.id ? { ...x, status: "archived" } : x))
      );
    setBusy("");
  }

  async function handlePromoteToProject(idea) {
    setBusy(idea.id);
    const res = await promoteIdeaToProject(user.id, idea.id);
    if (!res.error && res.data?.category?.id) {
      setIdeas((l) =>
        l.map((x) => (x.id === idea.id ? { ...x, status: "promoted" } : x))
      );
      router.push(`/category/${res.data.category.id}`);
    }
    setBusy("");
  }

  async function handlePromoteToTask(idea) {
    setBusy(idea.id);
    const res = await promoteIdeaToTask(user.id, idea.id);
    if (!res.error) {
      await updateIdea(user.id, idea.id, { status: "promoted" });
      setIdeas((l) =>
        l.map((x) => (x.id === idea.id ? { ...x, status: "promoted" } : x))
      );
    }
    setBusy("");
  }

  async function scoreIdea(idea) {
    if (!user || !idea || scoring) return;
    setScoring(idea.id);
    setScoreError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/score-idea", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ idea_id: idea.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setIdeas((l) =>
        l.map((x) => (x.id === idea.id ? { ...x, scores: data.scores } : x))
      );
    } catch (err) {
      setScoreError(err.message || "Failed to score.");
    } finally {
      setScoring(null);
    }
  }

  async function saveEdit() {
    if (!user || !selected || editing) return;
    setEditing(true);
    const res = await updateIdea(user.id, selected.id, {
      title: editTitle.trim() || selected.title,
      details: editDetails,
    });
    if (!res.error && res.data) {
      setIdeas((l) =>
        l.map((x) =>
          x.id === selected.id
            ? { ...x, title: editTitle.trim() || x.title, details: editDetails }
            : x
        )
      );
    }
    setEditing(false);
  }

  if (!user) return null;

  const coachPayload = {
    total_ideas: ideas.length,
    sample_titles: ideas.slice(0, 10).map((i) => ({
      title: i.title,
      status: i.status,
      scored: !!(i.scores && i.scores.alignment != null),
    })),
    shaping_count: ideas.filter((i) => statusToStage(i.status) === "shaping").length,
    new_count: ideas.filter((i) => statusToStage(i.status) === "new").length,
    promoted_count: ideas.filter((i) => i.status === "promoted").length,
  };

  return (
    <PSShell scope="ideas" title="Ideas" coachPayload={coachPayload}>
        <div className="ps-view">
          <div className="ps-eyebrow">Capture · Ideas &amp; sparks</div>
          <h1 className="ps-title">Ideas.</h1>
          <p className="ps-sub">
            Capture sparks first. Shape the ones that keep pulling. Graduate a
            spark into a real project when it&apos;s earned its place.
          </p>

          {error && <div className="today-error">{error}</div>}

          <div className="ideas-capture">
            <input
              className="ideas-capture-title"
              placeholder="A spark — what did you just think of?"
              value={captureTitle}
              onChange={(e) => setCaptureTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCapture();
              }}
            />
            <textarea
              className="ideas-capture-body"
              placeholder="Optional — why, how, who for (free-form)"
              value={captureDetails}
              onChange={(e) => setCaptureDetails(e.target.value)}
            />
            <div className="ideas-capture-actions">
              <button
                className="ps-btn ps-btn--primary"
                onClick={handleCapture}
                disabled={!captureTitle.trim() || capturing}
              >
                {capturing ? "Saving…" : "Capture →"}
              </button>
            </div>
          </div>

          <div className="ideas-controls">
            <div className="ideas-view-toggle">
              {[
                ["board", "Board"],
                ["list", "Ranked"],
              ].map(([id, l]) => (
                <button
                  key={id}
                  className={"ideas-vtog" + (view === id ? " active" : "")}
                  onClick={() => setView(id)}
                >
                  {l}
                </button>
              ))}
            </div>
            <input
              className="ideas-search"
              placeholder="Search ideas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="ideas-count">
              {ideas.length} idea{ideas.length === 1 ? "" : "s"} captured
            </div>
          </div>

          {loading && <div className="fit-empty">Loading…</div>}

          {!loading && view === "board" && (
            <div className="ideas-board">
              {STAGES.map((s) => (
                <div key={s.id} className="ideas-col">
                  <div className="ideas-col-head">
                    <span
                      className="ideas-col-dot"
                      style={{ background: s.color }}
                    />
                    <div>
                      <div className="ideas-col-label">{s.label}</div>
                      <div className="ideas-col-sub">{s.sub}</div>
                    </div>
                    <div className="ideas-col-count">
                      {grouped[s.id]?.length || 0}
                    </div>
                  </div>
                  <div className="ideas-col-items">
                    {(grouped[s.id] || []).map((i) => (
                      <button
                        key={i.id}
                        className={
                          "ideas-card" +
                          (selectedId === i.id ? " selected" : "")
                        }
                        onClick={() => setSelectedId(i.id)}
                      >
                        <div className="ideas-card-title">{i.title}</div>
                        {i.details && (
                          <div className="ideas-card-body">
                            {(i.details || "").slice(0, 120)}
                            {(i.details || "").length > 120 ? "…" : ""}
                          </div>
                        )}
                      </button>
                    ))}
                    {(grouped[s.id] || []).length === 0 && (
                      <div className="ideas-col-empty">—</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && view === "list" && (
            <div className="ideas-list">
              {ideas
                .filter((i) =>
                  !search.trim()
                    ? true
                    : (i.title || "")
                        .toLowerCase()
                        .includes(search.trim().toLowerCase())
                )
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((i) => (
                  <button
                    key={i.id}
                    className={
                      "ideas-list-row" +
                      (selectedId === i.id ? " selected" : "")
                    }
                    onClick={() => setSelectedId(i.id)}
                  >
                    <span
                      className="ideas-list-pill"
                      style={{
                        background:
                          STAGES.find((s) => s.id === statusToStage(i.status))?.color ||
                          "var(--ps-ink-30)",
                      }}
                    >
                      {STAGES.find((s) => s.id === statusToStage(i.status))?.label ||
                        "new"}
                    </span>
                    <div className="ideas-list-title">{i.title}</div>
                    {i.details && (
                      <div className="ideas-list-sub">
                        {(i.details || "").slice(0, 80)}
                      </div>
                    )}
                    <div className="ideas-list-date">
                      {new Date(i.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </button>
                ))}
            </div>
          )}

          {selected && (
            <div className="ideas-detail">
              <div className="ideas-detail-head">
                <div className="ideas-detail-stage">
                  <span
                    className="ideas-detail-dot"
                    style={{
                      background:
                        STAGES.find((s) => s.id === statusToStage(selected.status))?.color,
                    }}
                  />
                  {STAGES.find((s) => s.id === statusToStage(selected.status))?.label}
                </div>
                <button
                  className="ideas-detail-close"
                  onClick={() => setSelectedId(null)}
                >
                  ×
                </button>
              </div>
              <input
                className="ideas-detail-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Idea title"
              />
              <textarea
                className="ideas-detail-body-input"
                value={editDetails}
                onChange={(e) => setEditDetails(e.target.value)}
                placeholder="Shape it — why it matters, who it's for, what makes it different, any risks you see."
              />
              {selected.scores && Object.keys(selected.scores).length > 0 && (
                <div className="ideas-scores">
                  <div className="ideas-scores-head">
                    <span className="ideas-scores-cap">Coach scoring</span>
                    {selected.scores.scored_at && (
                      <span className="ideas-scores-when">
                        {new Date(selected.scores.scored_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                    )}
                  </div>
                  <div className="ideas-scores-bars">
                    {SCORE_DIMS.map((d) => {
                      const v = selected.scores?.[d.id];
                      if (v == null) return null;
                      return (
                        <div key={d.id} className="ideas-score-row">
                          <span
                            className="ideas-score-label"
                            style={{ color: d.color }}
                          >
                            {d.label}
                          </span>
                          <span className="ideas-score-bar">
                            <span
                              className="ideas-score-fill"
                              style={{
                                width: v + "%",
                                background: d.color,
                              }}
                            />
                          </span>
                          <span className="ideas-score-num">{v}</span>
                        </div>
                      );
                    })}
                  </div>
                  {selected.scores.critique && (
                    <div className="ideas-critique">
                      {selected.scores.critique.strength && (
                        <div className="ideas-critique-row">
                          <span className="ideas-critique-cap">Strength</span>
                          <span>{selected.scores.critique.strength}</span>
                        </div>
                      )}
                      {selected.scores.critique.risk && (
                        <div className="ideas-critique-row">
                          <span className="ideas-critique-cap">Risk</span>
                          <span>{selected.scores.critique.risk}</span>
                        </div>
                      )}
                      {selected.scores.critique.question && (
                        <div className="ideas-critique-row">
                          <span className="ideas-critique-cap">Question</span>
                          <span>{selected.scores.critique.question}</span>
                        </div>
                      )}
                      {selected.scores.critique.next_step && (
                        <div className="ideas-critique-row">
                          <span className="ideas-critique-cap">Next step</span>
                          <span>{selected.scores.critique.next_step}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {scoreError && (
                <div className="today-error" style={{ margin: 0 }}>
                  {scoreError}
                </div>
              )}
              <div className="ideas-detail-actions">
                <button
                  className="ps-btn"
                  onClick={() => scoreIdea(selected)}
                  disabled={scoring === selected.id}
                >
                  {scoring === selected.id
                    ? "Scoring…"
                    : selected.scores && Object.keys(selected.scores).length > 0
                    ? "Re-score with coach"
                    : "Score with coach"}
                </button>
                <button
                  className="ps-btn ps-btn--primary"
                  onClick={saveEdit}
                  disabled={editing}
                >
                  {editing ? "Saving…" : "Save"}
                </button>
                {selected.status === "new" && (
                  <button
                    className="ps-btn"
                    onClick={() => setStatus(selected, "shaping")}
                    disabled={busy === selected.id}
                  >
                    Move to Shaping
                  </button>
                )}
                {selected.status === "shaping" && (
                  <button
                    className="ps-btn"
                    onClick={() => setStatus(selected, "new")}
                    disabled={busy === selected.id}
                  >
                    ← Back to Raw
                  </button>
                )}
                {selected.status !== "promoted" && selected.status !== "archived" && (
                  <>
                    <button
                      className="ps-btn ps-btn--primary"
                      onClick={() => handlePromoteToProject(selected)}
                      disabled={busy === selected.id}
                      title="Create a new project (category) + kickoff task, then open it"
                    >
                      Promote to Project →
                    </button>
                    <button
                      className="ps-btn"
                      onClick={() => handlePromoteToTask(selected)}
                      disabled={busy === selected.id}
                      title="Add as a single task under an existing project"
                    >
                      Or: add as task
                    </button>
                  </>
                )}
                {selected.status !== "archived" && (
                  <button
                    className="ps-btn"
                    onClick={() => handleArchive(selected)}
                    disabled={busy === selected.id}
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

      <style jsx global>{`
        .ideas-capture {
          margin-top: 14px;
          padding: 14px 16px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(30, 27, 22, 0.04);
        }
        .ideas-capture-title {
          width: 100%;
          appearance: none;
          border: none;
          outline: none;
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          background: transparent;
          color: var(--ps-ink);
          padding: 4px 0;
          margin-bottom: 2px;
        }
        .ideas-capture-title::placeholder {
          color: var(--ps-ink-30);
          font-style: italic;
        }
        .ideas-capture-body {
          width: 100%;
          appearance: none;
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.55;
          min-height: 60px;
          resize: vertical;
        }
        .ideas-capture-body::placeholder {
          color: var(--ps-ink-40);
        }
        .ideas-capture-actions {
          display: flex;
          justify-content: flex-end;
          padding-top: 8px;
          border-top: 1px dashed var(--ps-ink-08);
          margin-top: 6px;
        }
        .ideas-controls {
          margin-top: 18px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .ideas-view-toggle {
          display: flex;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          padding: 3px;
          gap: 2px;
        }
        .ideas-vtog {
          appearance: none;
          border: none;
          background: transparent;
          padding: 6px 14px;
          border-radius: 5px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
        }
        .ideas-vtog.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
        }
        .ideas-search {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: #fff;
          padding: 7px 10px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          flex: 1;
          max-width: 320px;
        }
        .ideas-count {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .ideas-board {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 16px;
        }
        .ideas-col {
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ideas-col-head {
          display: grid;
          grid-template-columns: 10px 1fr auto;
          gap: 8px;
          align-items: center;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--ps-ink-08);
        }
        .ideas-col-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .ideas-col-label {
          font-family: var(--ps-serif);
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .ideas-col-sub {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .ideas-col-count {
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-50);
        }
        .ideas-col-items {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 80px;
        }
        .ideas-col-empty {
          font-family: var(--ps-serif);
          font-size: 20px;
          color: var(--ps-ink-30);
          text-align: center;
          padding: 16px 0;
        }
        .ideas-card {
          appearance: none;
          text-align: left;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          transition: border-color 120ms, box-shadow 120ms;
          font-family: inherit;
        }
        .ideas-card:hover {
          border-color: var(--ps-ink-30);
        }
        .ideas-card.selected {
          border-color: var(--ps-accent);
          box-shadow: 0 0 0 2px var(--ps-accent-soft);
        }
        .ideas-card-title {
          font-family: var(--ps-serif);
          font-size: 14px;
          letter-spacing: -0.01em;
          line-height: 1.3;
        }
        .ideas-card-body {
          font-size: 11.5px;
          color: var(--ps-ink-60);
          line-height: 1.45;
          margin-top: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ideas-list {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ideas-list-row {
          appearance: none;
          width: 100%;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          padding: 10px 14px;
          display: grid;
          grid-template-columns: 90px 1fr 200px 50px;
          gap: 14px;
          align-items: center;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        .ideas-list-row:hover {
          border-color: var(--ps-ink-30);
        }
        .ideas-list-row.selected {
          border-color: var(--ps-accent);
        }
        .ideas-list-pill {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #fff;
          padding: 3px 6px;
          border-radius: 4px;
          text-align: center;
        }
        .ideas-list-title {
          font-size: 13.5px;
          color: var(--ps-ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ideas-list-sub {
          font-size: 11.5px;
          color: var(--ps-ink-60);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ideas-list-date {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          text-align: right;
        }
        .ideas-detail {
          margin-top: 24px;
          padding: 18px 20px;
          background: #fff;
          border: 1px solid var(--ps-accent);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 0 0 3px var(--ps-accent-soft);
        }
        .ideas-detail-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ideas-detail-stage {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
        }
        .ideas-detail-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .ideas-detail-close {
          appearance: none;
          background: transparent;
          border: none;
          font-size: 18px;
          color: var(--ps-ink-40);
          cursor: pointer;
        }
        .ideas-detail-title-input {
          appearance: none;
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--ps-serif);
          font-size: 22px;
          letter-spacing: -0.015em;
          line-height: 1.25;
          color: var(--ps-ink);
          padding: 0;
        }
        .ideas-detail-body-input {
          appearance: none;
          border: 1px dashed var(--ps-ink-10);
          background: var(--ps-paper);
          outline: none;
          padding: 10px 12px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.55;
          min-height: 140px;
          resize: vertical;
        }
        .ideas-scores {
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 12px 14px;
        }
        .ideas-scores-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .ideas-scores-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .ideas-scores-when {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .ideas-scores-bars {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .ideas-score-row {
          display: grid;
          grid-template-columns: 90px 1fr 28px;
          gap: 10px;
          align-items: center;
          font-family: var(--ps-mono);
          font-size: 11px;
        }
        .ideas-score-label {
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .ideas-score-bar {
          height: 5px;
          background: var(--ps-ink-08);
          border-radius: 3px;
          position: relative;
          overflow: hidden;
        }
        .ideas-score-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          border-radius: 3px;
        }
        .ideas-score-num {
          text-align: right;
          color: var(--ps-ink-70);
        }
        .ideas-critique {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px dashed var(--ps-ink-10);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ideas-critique-row {
          display: grid;
          grid-template-columns: 90px 1fr;
          gap: 10px;
          font-size: 12px;
          color: var(--ps-ink-80);
          line-height: 1.5;
        }
        .ideas-critique-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .ideas-detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        @media (max-width: 1000px) {
          .ideas-board { grid-template-columns: 1fr 1fr; }
          .ideas-list-row {
            grid-template-columns: 90px 1fr auto;
          }
          .ideas-list-sub { display: none; }
        }
        @media (max-width: 600px) {
          .ideas-board { grid-template-columns: 1fr; }
        }
      `}</style>
    </PSShell>
  );
}
