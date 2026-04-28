import { useEffect, useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  toggleNotePinned,
  toggleNoteJarvisFeed,
  setNoteTags,
} from "../lib/db";

const TAG_COLORS = [
  "#b97316",
  "#6b8f71",
  "#4a6b8f",
  "#8a5a7a",
  "#b85c3e",
  "#a68a2e",
];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function isNotesTableMissing(msg) {
  if (!msg) return false;
  const s = String(msg).toLowerCase();
  return (
    s.includes("could not find the table") ||
    s.includes("public.notes") ||
    s.includes("public.note_tags") ||
    s.includes("schema cache") ||
    s.includes("jarvis_feed") ||
    s.includes("pinned")
  );
}

const MIGRATION_MESSAGE =
  "Notes enrichment columns are missing. Run db/NOTES_ENRICHMENT.sql in the Supabase SQL editor (adds pinned, jarvis_feed, updated_at, and note_tags).";

function normaliseNote(raw) {
  const tags = (raw.note_tags || [])
    .map((rel) => rel?.tags)
    .filter(Boolean)
    .map((t) => ({
      id: t.id,
      label: t.name,
      color: t.color || hashColor(t.name || ""),
    }));
  return {
    id: raw.id,
    title: raw.title || "",
    body: raw.body || "",
    created_at: raw.created_at,
    pinned: !!raw.pinned,
    jarvisFeed: !!raw.jarvis_feed,
    tags,
  };
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const h = diff / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(diff / 60000))} min ago`;
  if (h < 24) return `${Math.round(h)} hr ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByDay(notes) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = [];
  const index = {};
  for (const n of notes) {
    const d = new Date(n.created_at);
    const key = d.toISOString().slice(0, 10);
    if (!index[key]) {
      index[key] = { key, date: d, items: [] };
      groups.push(index[key]);
    }
    index[key].items.push(n);
  }
  for (const g of groups) {
    const d = new Date(g.date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) g.label = "Today";
    else if (diff === 1) g.label = "Yesterday";
    else if (diff < 7)
      g.label = d.toLocaleDateString(undefined, { weekday: "long" });
    else
      g.label = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    g.subLabel = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  return groups;
}

function computeStats(notes) {
  const total = notes.length;
  const pinned = notes.filter((n) => n.pinned).length;
  const feedingJarvis = notes.filter((n) => n.jarvisFeed).length;

  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const thisWeek = notes.filter(
    (n) => new Date(n.created_at).getTime() >= startOfWeek.getTime()
  ).length;

  const daysWith = new Set(
    notes.map((n) => new Date(n.created_at).toISOString().slice(0, 10))
  );
  let currentStreak = 0;
  const probe = new Date();
  probe.setHours(0, 0, 0, 0);
  while (daysWith.has(probe.toISOString().slice(0, 10))) {
    currentStreak += 1;
    probe.setDate(probe.getDate() - 1);
  }

  let longest = 0;
  let run = 0;
  const sortedDays = [...daysWith].sort();
  let prev = null;
  for (const day of sortedDays) {
    if (!prev) {
      run = 1;
    } else {
      const diff =
        (new Date(day).getTime() - new Date(prev).getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prev = day;
  }

  return {
    total,
    pinned,
    feedingJarvis,
    thisWeek,
    currentStreak,
    longestStreak: longest,
  };
}

function TagPills({ tags, max }) {
  if (!tags || tags.length === 0) return null;
  const list = max ? tags.slice(0, max) : tags;
  const remainder = max ? tags.length - max : 0;
  return (
    <div className="notes-card-tags">
      {list.map((t) => (
        <span
          key={t.id}
          className="notes-card-tag"
          style={{ color: t.color, borderColor: t.color + "40" }}
        >
          #{t.label.toLowerCase()}
        </span>
      ))}
      {remainder > 0 && (
        <span className="notes-card-tag more">+{remainder}</span>
      )}
    </div>
  );
}

export default function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftFeedJarvis, setDraftFeedJarvis] = useState(false);
  const [draftTags, setDraftTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterTag, setFilterTag] = useState(null);
  const [filterPinned, setFilterPinned] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const res = await getNotes(user.id);
      if (cancelled) return;
      if (res.error) {
        setError(
          isNotesTableMissing(res.error.message)
            ? MIGRATION_MESSAGE
            : res.error.message
        );
      } else {
        const list = (res.data || []).map(normaliseNote);
        setNotes(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const allTags = useMemo(() => {
    const map = new Map();
    for (const n of notes) {
      for (const t of n.tags) {
        if (!map.has(t.id)) map.set(t.id, { ...t, count: 0 });
        map.get(t.id).count += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [notes]);

  const stats = useMemo(() => computeStats(notes), [notes]);

  const visibleNotes = useMemo(() => {
    let list = [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    if (filterPinned) list = list.filter((n) => n.pinned);
    if (filterTag) list = list.filter((n) => n.tags.some((t) => t.id === filterTag));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          (n.title || "").toLowerCase().includes(q) ||
          (n.body || "").toLowerCase().includes(q) ||
          n.tags.some((t) => t.label.toLowerCase().includes(q))
      );
    }
    return list;
  }, [notes, filterPinned, filterTag, search]);

  const groups = useMemo(() => groupByDay(visibleNotes), [visibleNotes]);
  const selected = notes.find((n) => n.id === selectedId) || visibleNotes[0];

  function parseTags(raw) {
    return String(raw || "")
      .split(/[,\s]+/)
      .map((s) => s.replace(/^#/, "").trim())
      .filter(Boolean);
  }

  async function handleSave() {
    if (!user || !draftBody.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = await createNote(user.id, {
      title: draftTitle.trim() || null,
      body: draftBody.trim(),
    });
    if (res.error) {
      setError(
        isNotesTableMissing(res.error.message)
          ? MIGRATION_MESSAGE
          : res.error.message
      );
      setSaving(false);
      return;
    }
    const noteId = res.data.id;
    const tagNames = parseTags(draftTags);
    if (tagNames.length > 0) {
      const tagRes = await setNoteTags(user.id, noteId, tagNames);
      if (tagRes?.error) {
        console.error("[notes] capture setNoteTags failed:", tagRes.error);
        setError(tagRes.error.message || "Failed to save tags.");
      }
    }
    if (draftFeedJarvis) {
      const jRes = await toggleNoteJarvisFeed(user.id, noteId, true);
      if (jRes?.error) {
        console.error("[notes] capture toggleNoteJarvisFeed failed:", jRes.error);
        setError(jRes.error.message || "Failed to feed Jarvis.");
      }
    }
    const reload = await getNotes(user.id);
    if (reload.error) {
      console.error("[notes] capture reload failed:", reload.error);
      setError(reload.error.message || "Note saved, but failed to refresh list.");
    } else {
      const list = (reload.data || []).map(normaliseNote);
      setNotes(list);
      setSelectedId(noteId);
    }
    setDraftTitle("");
    setDraftBody("");
    setDraftTags("");
    setDraftFeedJarvis(false);
    setCaptureOpen(false);
    setSaving(false);
  }

  async function handleTogglePinned(note) {
    const next = !note.pinned;
    setNotes((ns) => ns.map((n) => (n.id === note.id ? { ...n, pinned: next } : n)));
    const res = await toggleNotePinned(user.id, note.id, next);
    if (res.error) {
      setNotes((ns) => ns.map((n) => (n.id === note.id ? { ...n, pinned: !next } : n)));
    }
  }

  async function handleToggleJarvis(note) {
    const next = !note.jarvisFeed;
    setNotes((ns) =>
      ns.map((n) => (n.id === note.id ? { ...n, jarvisFeed: next } : n))
    );
    const res = await toggleNoteJarvisFeed(user.id, note.id, next);
    if (res.error) {
      setNotes((ns) =>
        ns.map((n) => (n.id === note.id ? { ...n, jarvisFeed: !next } : n))
      );
    }
  }

  async function handleDelete(note) {
    if (!window.confirm(`Delete "${note.title || "this note"}"?`)) return;
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== note.id));
    if (selectedId === note.id) setSelectedId(null);
    const res = await deleteNote(user.id, note.id);
    if (res.error) setNotes(prev);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditTitle(note.title || "");
    setEditBody(note.body || "");
    setEditTags(note.tags.map((t) => t.label).join(" "));
  }

  async function saveEdit(note) {
    if (!user || !note) return;
    setSaving(true);
    const res = await updateNote(user.id, note.id, {
      title: editTitle.trim() || null,
      body: editBody,
    });
    if (res.error) {
      setError(
        isNotesTableMissing(res.error.message)
          ? MIGRATION_MESSAGE
          : res.error.message
      );
      setSaving(false);
      return;
    }
    const names = parseTags(editTags);
    const tagRes = await setNoteTags(user.id, note.id, names);
    if (tagRes?.error) {
      console.error("[notes] edit setNoteTags failed:", tagRes.error);
      setError(tagRes.error.message || "Failed to save tags.");
    }
    const reload = await getNotes(user.id);
    if (!reload.error) {
      setNotes((reload.data || []).map(normaliseNote));
    }
    setEditingId(null);
    setSaving(false);
  }

  if (!user) return null;

  const coachPayload = {
    total_notes: stats.total,
    pinned: stats.pinned,
    feeding_jarvis: stats.feedingJarvis,
    current_streak: stats.currentStreak,
    recent_note_titles: visibleNotes
      .slice(0, 8)
      .map((n) => n.title || (n.body || "").slice(0, 60)),
    tags_in_use: allTags.slice(0, 8).map((t) => t.label),
  };

  return (
    <PSShell scope="notes" title="Notes" coachPayload={coachPayload} coachPayloadReady={!loading}>
      <div className="ps-view notes-view">
          <div className="ps-eyebrow">Also in app · Notes</div>
          <div className="notes-title-row">
            <div>
              <h1 className="ps-title">Notes &amp; journal.</h1>
              <p className="ps-sub">
                Freeform capture. Drop in thoughts, decisions, morning body
                checks, overheard lines, weekly-review scratch. Tag what you
                want the coach to remember — those notes feed Jarvis. Everything
                else stays just for you.
              </p>
            </div>
            <button
              type="button"
              className="notes-capture-btn"
              onClick={() => setCaptureOpen((o) => !o)}
            >
              <span className="notes-plus">+</span>
              <span>New note</span>
            </button>
          </div>

          {error && (
            <div className="notes-error">{error}</div>
          )}

          {captureOpen && (
            <div className="notes-capture">
              <div className="notes-capture-label">
                <span>Capture · timestamped · multi-per-day</span>
                <span className="notes-capture-time">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {new Date().toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <input
                className="notes-capture-title"
                placeholder="Title (optional) — leave blank for a timestamped scratch"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="notes-capture-body"
                placeholder="What's on your mind? Morning body check, a decision, a quote, a line you want to remember."
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
              />
              <input
                className="notes-capture-tags"
                placeholder="Tags — space or comma separated (e.g. ensenada body)"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
              />
              <div className="notes-capture-actions">
                <div className="notes-capture-hint">
                  <span className="notes-dot" />
                  Tag with <code>#ensenada</code> or <code>#body</code>. Toggle{" "}
                  <strong>Feed Jarvis</strong> to let the coach reference this.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <label className="notes-mini-check">
                    <input
                      type="checkbox"
                      checked={draftFeedJarvis}
                      onChange={(e) => setDraftFeedJarvis(e.target.checked)}
                    />
                    Feed Jarvis
                  </label>
                  <button
                    type="button"
                    className="notes-btn"
                    onClick={() => {
                      setCaptureOpen(false);
                      setDraftTitle("");
                      setDraftBody("");
                      setDraftTags("");
                      setDraftFeedJarvis(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="notes-btn primary"
                    disabled={!draftBody.trim() || saving}
                    onClick={handleSave}
                  >
                    {saving ? "Saving…" : "Save note →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="notes-stats">
            {[
              { label: "Total notes", v: stats.total, sub: "all time" },
              { label: "This week", v: stats.thisWeek, sub: "since Mon" },
              { label: "Pinned", v: stats.pinned, sub: "always on top" },
              {
                label: "Feeding Jarvis",
                v: stats.feedingJarvis,
                sub: "in memory",
                accent: true,
              },
              {
                label: "Current streak",
                v: stats.currentStreak + "d",
                sub: "days w/ ≥1 note",
                accent: true,
              },
              {
                label: "Best streak",
                v: stats.longestStreak + "d",
                sub: "all time",
              },
            ].map((c, i) => (
              <div
                key={i}
                className={"notes-stat" + (c.accent ? " accent" : "")}
              >
                <div className="notes-stat-label">{c.label}</div>
                <div className="notes-stat-v">{c.v}</div>
                <div className="notes-stat-sub">{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="notes-main">
            <aside className="notes-filter">
              <div className="notes-filter-search">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{ flexShrink: 0, opacity: 0.5 }}
                >
                  <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
                  <line
                    x1="7.5"
                    y1="7.5"
                    x2="10.5"
                    y2="10.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  placeholder="Search notes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="notes-filter-clear"
                    onClick={() => setSearch("")}
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="notes-filter-section">
                <div className="notes-filter-cap">View</div>
                <button
                  className={
                    "notes-filter-row" +
                    (!filterTag && !filterPinned ? " active" : "")
                  }
                  onClick={() => {
                    setFilterTag(null);
                    setFilterPinned(false);
                  }}
                >
                  <span
                    className="notes-filter-dot"
                    style={{ background: "var(--ps-ink)" }}
                  />
                  <span className="notes-filter-label">All notes</span>
                  <span className="notes-filter-count">{stats.total}</span>
                </button>
                <button
                  className={
                    "notes-filter-row" + (filterPinned ? " active" : "")
                  }
                  onClick={() => {
                    setFilterPinned((p) => !p);
                    setFilterTag(null);
                  }}
                >
                  <span className="notes-filter-dot pin">★</span>
                  <span className="notes-filter-label">Pinned</span>
                  <span className="notes-filter-count">{stats.pinned}</span>
                </button>
              </div>

              {allTags.length > 0 && (
                <div className="notes-filter-section">
                  <div className="notes-filter-cap">Tags</div>
                  {allTags.map((t) => (
                    <button
                      key={t.id}
                      className={
                        "notes-filter-row" + (filterTag === t.id ? " active" : "")
                      }
                      onClick={() => {
                        setFilterTag((v) => (v === t.id ? null : t.id));
                        setFilterPinned(false);
                      }}
                    >
                      <span
                        className="notes-filter-dot"
                        style={{ background: t.color }}
                      />
                      <span className="notes-filter-label">{t.label}</span>
                      <span className="notes-filter-count">{t.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <div className="notes-list">
              {loading && <div className="notes-empty">Loading…</div>}
              {!loading && groups.length === 0 && (
                <div className="notes-empty">
                  <div className="notes-empty-mark">—</div>
                  <div>No notes match.</div>
                  <button
                    className="notes-btn"
                    onClick={() => {
                      setFilterTag(null);
                      setFilterPinned(false);
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.key} className="notes-day-group">
                  <div className="notes-day-header">
                    <span className="notes-day-label">{g.label}</span>
                    <span className="notes-day-sub">{g.subLabel}</span>
                    <span className="notes-day-count">
                      {g.items.length} note{g.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="notes-day-items">
                    {g.items.map((n) => {
                      const preview = (n.body || "").slice(0, 160);
                      return (
                        <div
                          key={n.id}
                          className={
                            "notes-card" +
                            (n.id === selected?.id ? " selected" : "")
                          }
                          onClick={() => setSelectedId(n.id)}
                        >
                          <div className="notes-card-head">
                            <span className="notes-card-time">
                              {formatTime(n.created_at)}
                            </span>
                            {n.pinned && (
                              <span className="notes-card-pin" title="Pinned">
                                ★
                              </span>
                            )}
                            {n.jarvisFeed && (
                              <span
                                className="notes-card-jv"
                                title="Feeds Jarvis"
                              >
                                J
                              </span>
                            )}
                          </div>
                          {n.title && (
                            <div className="notes-card-title">{n.title}</div>
                          )}
                          <div className="notes-card-body">
                            {preview}
                            {(n.body || "").length > 160 ? "…" : ""}
                          </div>
                          <TagPills tags={n.tags} max={3} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div className="notes-detail">
                <div className="notes-detail-head">
                  <div className="notes-detail-eyebrow">
                    <span className="notes-detail-date">
                      {new Date(selected.created_at).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                    <span className="notes-detail-sep">·</span>
                    <span className="notes-detail-time">
                      {formatTime(selected.created_at)}
                    </span>
                    {selected.pinned && (
                      <>
                        <span className="notes-detail-sep">·</span>
                        <span className="notes-detail-flag pin">pinned</span>
                      </>
                    )}
                  </div>
                  {editingId === selected.id ? (
                    <input
                      className="notes-capture-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title (optional)"
                    />
                  ) : selected.title ? (
                    <h2 className="notes-detail-title">{selected.title}</h2>
                  ) : (
                    <div className="notes-detail-untitled">
                      Untitled · {formatTime(selected.created_at)}
                    </div>
                  )}
                  <div className="notes-detail-actions">
                    {editingId === selected.id ? (
                      <>
                        <button
                          className="notes-btn primary"
                          disabled={saving}
                          onClick={() => saveEdit(selected)}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="notes-btn"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="notes-btn"
                          onClick={() => startEdit(selected)}
                        >
                          Edit
                        </button>
                        <button
                          className="notes-btn"
                          onClick={() => handleTogglePinned(selected)}
                        >
                          {selected.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          className="notes-btn"
                          onClick={() => handleToggleJarvis(selected)}
                        >
                          {selected.jarvisFeed ? "✓ Feeding Jarvis" : "Feed Jarvis"}
                        </button>
                        <button
                          className="notes-btn danger"
                          onClick={() => handleDelete(selected)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editingId === selected.id ? (
                  <>
                    <textarea
                      className="notes-capture-body"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      style={{ minHeight: 160 }}
                    />
                    <input
                      className="notes-capture-tags"
                      placeholder="Tags — space or comma separated"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                    />
                  </>
                ) : (
                  <div className="notes-detail-body">
                    {(selected.body || "").split("\n\n").map((para, i) => (
                      <p key={i}>
                        {para.split("\n").map((line, j, arr) => (
                          <span key={j}>
                            {line}
                            {j < arr.length - 1 && <br />}
                          </span>
                        ))}
                      </p>
                    ))}
                  </div>
                )}

                {selected.tags.length > 0 && editingId !== selected.id && (
                  <div className="notes-detail-tags">
                    <div className="notes-filter-cap">Tags</div>
                    <div className="notes-detail-tags-row">
                      <TagPills tags={selected.tags} />
                    </div>
                  </div>
                )}

                {selected.jarvisFeed && editingId !== selected.id && (
                  <div className="notes-detail-jarvis">
                    <div
                      className="notes-filter-cap"
                      style={{ color: "var(--ps-accent)" }}
                    >
                      Jarvis memory · excerpt
                    </div>
                    <div className="notes-detail-jarvis-body">
                      Coach will cite this note when questions touch{" "}
                      <strong>
                        {selected.tags
                          .slice(0, 2)
                          .map((t) => t.label.toLowerCase())
                          .join(" · ") || "these themes"}
                      </strong>
                      .
                      <div className="notes-detail-jarvis-quote">
                        &quot;
                        {(selected.title || selected.body).slice(0, 120)}
                        {(selected.title || selected.body).length > 120 ? "…" : ""}
                        &quot;
                      </div>
                    </div>
                  </div>
                )}

                <div className="notes-detail-foot">
                  <div className="notes-detail-meta">
                    Created {formatRelative(selected.created_at)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      <style jsx global>{`
        .notes-view { padding-bottom: 80px; }
        .notes-title-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 20px;
          align-items: end;
          margin-top: 4px;
        }
        .notes-capture-btn {
          appearance: none;
          border: 1px solid var(--ps-ink);
          background: var(--ps-ink);
          color: var(--ps-bg);
          padding: 10px 14px;
          border-radius: 10px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .notes-capture-btn:hover { background: var(--ps-accent); border-color: var(--ps-accent); }
        .notes-plus { font-family: var(--ps-serif); font-size: 16px; line-height: 1; margin-top: -2px; }
        .notes-error {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--ps-clay-soft);
          color: var(--ps-clay);
          font-size: 13px;
          border: 1px solid rgba(184,92,62,0.22);
        }
        .notes-capture {
          margin-top: 18px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 1px 3px rgba(30, 27, 22, 0.04);
        }
        .notes-capture-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .notes-capture-time { color: var(--ps-accent); }
        .notes-capture-title {
          width: 100%;
          appearance: none;
          border: none;
          outline: none;
          font-family: var(--ps-serif);
          font-size: 22px;
          letter-spacing: -0.01em;
          background: transparent;
          color: var(--ps-ink);
          padding: 4px 0;
          margin-bottom: 4px;
        }
        .notes-capture-title::placeholder { color: var(--ps-ink-30); font-style: italic; }
        .notes-capture-body {
          width: 100%;
          appearance: none;
          border: none;
          outline: none;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.6;
          color: var(--ps-ink-80);
          background: transparent;
          resize: vertical;
          min-height: 100px;
          padding: 4px 0;
        }
        .notes-capture-body::placeholder { color: var(--ps-ink-40); }
        .notes-capture-tags {
          width: 100%;
          appearance: none;
          border: 1px dashed var(--ps-ink-10);
          outline: none;
          background: transparent;
          padding: 6px 10px;
          margin-top: 8px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 12px;
          color: var(--ps-ink-70);
        }
        .notes-capture-tags:focus { border-color: var(--ps-ink-30); border-style: solid; }
        .notes-capture-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px dashed var(--ps-ink-08);
          margin-top: 10px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .notes-capture-hint {
          font-size: 11.5px;
          color: var(--ps-ink-60);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .notes-capture-hint code {
          font-family: var(--ps-mono);
          font-size: 10.5px;
          padding: 1px 5px;
          background: var(--ps-ink-05);
          border-radius: 3px;
          color: var(--ps-ink-70);
        }
        .notes-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ps-accent);
          display: inline-block;
          flex-shrink: 0;
        }
        .notes-mini-check {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-ink-70);
          cursor: pointer;
          padding: 4px 8px;
          border: 1px solid var(--ps-ink-10);
          border-radius: 6px;
        }
        .notes-mini-check input { accent-color: var(--ps-accent); margin: 0; }
        .notes-btn {
          appearance: none;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          padding: 7px 12px;
          border-radius: 7px;
          cursor: pointer;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-70);
        }
        .notes-btn:hover { border-color: var(--ps-ink); color: var(--ps-ink); }
        .notes-btn.primary { background: var(--ps-ink); color: var(--ps-bg); border-color: var(--ps-ink); }
        .notes-btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .notes-btn.danger { color: var(--ps-clay); border-color: var(--ps-clay); }
        .notes-btn.danger:hover { background: var(--ps-clay); color: #fff; }
        .notes-stats {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          margin-top: 20px;
        }
        .notes-stat {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 12px 14px;
        }
        .notes-stat.accent { background: var(--ps-accent-soft); border-color: rgba(185, 115, 22, 0.2); }
        .notes-stat-label {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .notes-stat-v {
          font-family: var(--ps-serif);
          font-size: 26px;
          letter-spacing: -0.02em;
          font-weight: 500;
          line-height: 1.1;
          margin-top: 4px;
        }
        .notes-stat.accent .notes-stat-v { color: var(--ps-accent); }
        .notes-stat-sub {
          font-family: var(--ps-mono);
          font-size: 9.5px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
          margin-top: 2px;
        }
        .notes-main {
          display: grid;
          grid-template-columns: 220px 1fr 380px;
          gap: 18px;
          margin-top: 22px;
          align-items: start;
        }
        .notes-filter {
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: sticky;
          top: 0;
        }
        .notes-filter-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 8px;
        }
        .notes-filter-search input {
          flex: 1;
          appearance: none;
          border: none;
          outline: none;
          background: transparent;
          font-size: 12.5px;
          color: var(--ps-ink);
          font-family: inherit;
        }
        .notes-filter-search input::placeholder { color: var(--ps-ink-40); }
        .notes-filter-clear {
          appearance: none;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--ps-ink-50);
          font-size: 16px;
          line-height: 1;
          padding: 0 4px;
        }
        .notes-filter-section { display: flex; flex-direction: column; gap: 2px; }
        .notes-filter-cap {
          font-family: var(--ps-mono);
          font-size: 9.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 6px;
          padding: 0 4px;
        }
        .notes-filter-row {
          appearance: none;
          border: none;
          background: transparent;
          display: grid;
          grid-template-columns: 8px 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          width: 100%;
          text-align: left;
          color: var(--ps-ink-70);
          font-size: 12.5px;
          font-family: inherit;
          transition: background 100ms;
        }
        .notes-filter-row:hover { background: var(--ps-ink-05); color: var(--ps-ink); }
        .notes-filter-row.active { background: var(--ps-ink); color: var(--ps-bg); }
        .notes-filter-row.active .notes-filter-count { color: rgba(250, 247, 242, 0.6); }
        .notes-filter-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .notes-filter-dot.pin {
          background: transparent;
          width: auto;
          height: auto;
          color: var(--ps-gold);
          font-size: 11px;
          line-height: 1;
        }
        .notes-filter-label { font-weight: 400; }
        .notes-filter-row.active .notes-filter-label { font-weight: 500; }
        .notes-filter-count {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-40);
          letter-spacing: 0.04em;
        }
        .notes-list { display: flex; flex-direction: column; gap: 20px; }
        .notes-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--ps-ink-60);
          background: #fff;
          border: 1px dashed var(--ps-ink-15);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .notes-empty-mark {
          font-family: var(--ps-serif);
          font-size: 32px;
          color: var(--ps-ink-30);
        }
        .notes-day-group { display: flex; flex-direction: column; gap: 8px; }
        .notes-day-header {
          display: flex;
          align-items: baseline;
          gap: 10px;
          padding: 4px 2px 8px;
          border-bottom: 1px solid var(--ps-ink-10);
        }
        .notes-day-label {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
          font-weight: 500;
        }
        .notes-day-sub {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .notes-day-count {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
        }
        .notes-day-items { display: flex; flex-direction: column; gap: 6px; }
        .notes-card {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 12px 14px;
          cursor: pointer;
          transition: border-color 100ms, box-shadow 100ms;
        }
        .notes-card:hover { border-color: var(--ps-ink-30); }
        .notes-card.selected {
          border-color: var(--ps-accent);
          box-shadow: 0 0 0 3px var(--ps-accent-soft);
        }
        .notes-card-head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--ps-ink-50);
          margin-bottom: 4px;
        }
        .notes-card-time { text-transform: uppercase; }
        .notes-card-pin { color: var(--ps-gold); font-size: 11px; }
        .notes-card-jv {
          background: var(--ps-accent);
          color: #fff;
          font-family: var(--ps-mono);
          font-size: 9px;
          font-weight: 700;
          padding: 1px 4px;
          border-radius: 3px;
          letter-spacing: 0.04em;
        }
        .notes-card-title {
          font-family: var(--ps-serif);
          font-size: 15px;
          letter-spacing: -0.01em;
          font-weight: 500;
          line-height: 1.3;
          margin-bottom: 4px;
          color: var(--ps-ink);
        }
        .notes-card-body {
          font-size: 12.5px;
          color: var(--ps-ink-70);
          line-height: 1.55;
          margin-bottom: 6px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          white-space: pre-wrap;
        }
        .notes-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .notes-card-tag {
          font-family: var(--ps-mono);
          font-size: 9.5px;
          letter-spacing: 0.02em;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid var(--ps-ink-10);
          background: transparent;
          color: var(--ps-ink-60);
          line-height: 1.4;
        }
        .notes-card-tag.more {
          color: var(--ps-ink-50);
        }
        .notes-detail {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          padding: 20px 22px 18px;
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }
        .notes-detail-head { display: flex; flex-direction: column; gap: 10px; }
        .notes-detail-eyebrow {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--ps-ink-50);
          text-transform: uppercase;
          flex-wrap: wrap;
        }
        .notes-detail-sep { color: var(--ps-ink-30); }
        .notes-detail-date { color: var(--ps-ink-70); }
        .notes-detail-time { color: var(--ps-accent); }
        .notes-detail-flag {
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
        }
        .notes-detail-flag.pin {
          background: rgba(180, 140, 50, 0.15);
          color: var(--ps-gold);
        }
        .notes-detail-title {
          font-family: var(--ps-serif);
          font-size: 22px;
          letter-spacing: -0.015em;
          font-weight: 500;
          line-height: 1.25;
          margin: 0;
        }
        .notes-detail-untitled {
          font-family: var(--ps-serif);
          font-style: italic;
          color: var(--ps-ink-50);
          font-size: 14px;
        }
        .notes-detail-actions {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
          padding-top: 4px;
        }
        .notes-detail-body {
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--ps-ink-80);
          display: flex;
          flex-direction: column;
          gap: 10px;
          white-space: pre-wrap;
        }
        .notes-detail-body p { margin: 0; }
        .notes-detail-tags {
          padding-top: 10px;
          border-top: 1px solid var(--ps-ink-08);
        }
        .notes-detail-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .notes-detail-jarvis {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.18);
          border-radius: 10px;
          padding: 12px 14px;
        }
        .notes-detail-jarvis-body {
          margin-top: 6px;
          font-size: 12.5px;
          color: var(--ps-ink-80);
          line-height: 1.55;
        }
        .notes-detail-jarvis-body strong { color: var(--ps-accent); font-weight: 500; }
        .notes-detail-jarvis-quote {
          margin-top: 8px;
          padding: 8px 12px;
          background: #fff;
          border-left: 3px solid var(--ps-accent);
          border-radius: 4px;
          font-family: var(--ps-serif);
          font-style: italic;
          font-size: 13px;
          color: var(--ps-ink-70);
        }
        .notes-detail-foot {
          padding-top: 10px;
          border-top: 1px solid var(--ps-ink-08);
        }
        .notes-detail-meta {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-40);
          letter-spacing: 0.04em;
        }
        @media (max-width: 1500px) {
          .notes-main { grid-template-columns: 200px 1fr 340px; gap: 14px; }
          .notes-stats { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 1320px) {
          .notes-main { grid-template-columns: 180px 1fr; }
          .notes-detail {
            position: static;
            grid-column: 1 / -1;
            max-height: none;
          }
        }
        @media (max-width: 900px) {
          .notes-main { grid-template-columns: 1fr; }
          .notes-filter { position: static; flex-direction: row; flex-wrap: wrap; gap: 10px; }
          .notes-filter-section { flex: 1 1 200px; }
          .notes-title-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </PSShell>
  );
}
