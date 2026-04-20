import { useCallback, useEffect, useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import { updateTaskStatusWithEvent } from "../lib/db";

const CATEGORY_COLORS = [
  "var(--ps-clay)",
  "var(--ps-indigo)",
  "var(--ps-plum)",
  "var(--ps-accent)",
  "var(--ps-gold)",
  "var(--ps-sage)",
  "var(--ps-ink)",
];

const PRI_META = {
  P0: { label: "Do now", color: "var(--ps-clay)", soft: "var(--ps-clay-soft)" },
  P1: { label: "This week", color: "var(--ps-accent)", soft: "var(--ps-accent-soft)" },
  P2: { label: "Soon", color: "var(--ps-indigo)", soft: "var(--ps-indigo-soft)" },
  P3: { label: "Someday", color: "var(--ps-ink-50)", soft: "var(--ps-ink-05)" },
};

function toCode(pri) {
  if (pri === "Critical") return "P0";
  if (pri === "High") return "P1";
  if (pri === "Medium") return "P2";
  return "P3";
}

function fmtDue(d) {
  if (!d) return null;
  const date = new Date(d + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((date - now) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) return Math.abs(diff) + "d overdue";
  if (diff < 7) return "in " + diff + "d";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function BacklogPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState("matrix");
  const [groupBy, setGroupBy] = useState("project");
  const [priorityFilter, setPriorityFilter] = useState([]);
  const [projectFilter, setProjectFilter] = useState([]);
  const [hideDone, setHideDone] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, taskRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("tasks")
          .select(
            "id, title, status, priority, effort_hours, due_date, category_id, subcategory_id, created_at, outcome_ids, primary_life_domain, life_domains"
          )
          .eq("user_id", user.id)
          .is("archived_at", null)
          .order("priority", { ascending: false })
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
      ]);
      if (catRes.error) throw new Error(catRes.error.message);
      if (taskRes.error) throw new Error(taskRes.error.message);
      setCategories(catRes.data || []);
      setTasks(taskRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const colorMap = useMemo(() => {
    const m = {};
    categories.forEach((c, i) => {
      m[c.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    });
    return m;
  }, [categories]);

  const catMap = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const counts = useMemo(() => {
    const pri = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const proj = {};
    for (const t of tasks) {
      if (hideDone && t.status === "done") continue;
      pri[toCode(t.priority)] += 1;
      if (t.category_id) proj[t.category_id] = (proj[t.category_id] || 0) + 1;
    }
    return { pri, proj };
  }, [tasks, hideDone]);

  const visible = useMemo(() => {
    let list = [...tasks];
    if (hideDone) list = list.filter((t) => t.status !== "done");
    if (priorityFilter.length > 0)
      list = list.filter((t) => priorityFilter.includes(toCode(t.priority)));
    if (projectFilter.length > 0)
      list = list.filter((t) => projectFilter.includes(t.category_id));
    return list;
  }, [tasks, priorityFilter, projectFilter, hideDone]);

  const selected = tasks.find((t) => t.id === selectedId) || null;

  async function toggleStatus(t) {
    const nextStatus = t.status === "done" ? "todo" : "done";
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x))
    );
    const res = await updateTaskStatusWithEvent(user.id, t.id, nextStatus);
    if (res.error) {
      setTasks((ts) =>
        ts.map((x) => (x.id === t.id ? { ...x, status: t.status } : x))
      );
    }
  }

  function togglePriorityFilter(p) {
    setPriorityFilter((f) => (f.includes(p) ? f.filter((x) => x !== p) : [...f, p]));
  }

  function toggleProjectFilter(id) {
    setProjectFilter((f) =>
      f.includes(id) ? f.filter((x) => x !== id) : [...f, id]
    );
  }

  const matrixBuckets = useMemo(() => {
    const q1 = [], q2 = [], q3 = [], q4 = [];
    for (const t of visible) {
      const code = toCode(t.priority);
      const urgent = t.due_date && new Date(t.due_date + "T00:00:00") <= new Date(Date.now() + 3 * 86400000);
      const important = code === "P0" || code === "P1";
      if (urgent && important) q1.push(t);
      else if (!urgent && important) q2.push(t);
      else if (urgent && !important) q3.push(t);
      else q4.push(t);
    }
    return { q1, q2, q3, q4 };
  }, [visible]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const t of visible) {
      let key, label;
      if (groupBy === "project") {
        key = t.category_id || "none";
        label = catMap[t.category_id]?.name || "Uncategorised";
      } else if (groupBy === "priority") {
        key = toCode(t.priority);
        label = `${key} · ${PRI_META[key].label}`;
      } else if (groupBy === "date") {
        key = t.due_date || "no-date";
        label = t.due_date
          ? new Date(t.due_date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
          : "No due date";
      } else {
        key = t.category_id || "none";
        label = catMap[t.category_id]?.name || "Uncategorised";
      }
      if (!groups.has(key))
        groups.set(key, { key, label, items: [], color: colorMap[t.category_id] || "var(--ps-ink-30)" });
      groups.get(key).items.push(t);
    }
    return [...groups.values()];
  }, [visible, groupBy, catMap, colorMap]);

  function TaskRow({ t }) {
    const code = toCode(t.priority);
    const isDone = t.status === "done";
    return (
      <button
        type="button"
        className={`act-row${isDone ? " done" : ""}${selectedId === t.id ? " selected" : ""}`}
        onClick={() => setSelectedId(t.id)}
      >
        <span
          className="act-row-pri"
          style={{ background: PRI_META[code].color }}
          title={`${code} · ${PRI_META[code].label}`}
        >
          {code}
        </span>
        <span
          className="act-row-dot"
          style={{ background: colorMap[t.category_id] || "var(--ps-ink-30)" }}
        />
        <div className="act-row-body">
          <div className="act-row-title">{t.title}</div>
          <div className="act-row-meta">
            <span className="act-row-proj">
              {catMap[t.category_id]?.name || "—"}
            </span>
            {t.due_date && (
              <span className="act-row-due">{fmtDue(t.due_date)}</span>
            )}
            {t.effort_hours > 0 && (
              <span className="act-row-effort">
                {Math.round(t.effort_hours * 60)}m
              </span>
            )}
          </div>
        </div>
        <span
          className={`act-check${isDone ? " checked" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleStatus(t);
          }}
        >
          {isDone ? "✓" : ""}
        </span>
      </button>
    );
  }

  if (!user) return null;

  const coachPayload = {
    total_tasks: tasks.length,
    visible_tasks: visible.length,
    counts_by_priority: counts.pri,
    projects_visible: categories
      .filter((c) => counts.proj[c.id])
      .map((c) => ({
        name: c.name,
        count: counts.proj[c.id],
      })),
    matrix_bucket_counts: {
      q1_do_now: matrixBuckets.q1.length,
      q2_schedule: matrixBuckets.q2.length,
      q3_quick_wins: matrixBuckets.q3.length,
      q4_drop_or_defer: matrixBuckets.q4.length,
    },
    sample_titles: visible.slice(0, 14).map((t) => ({
      title: t.title,
      priority: t.priority,
      due: t.due_date,
    })),
  };

  return (
    <PSShell scope="actions" title="Action items" coachPayload={coachPayload}>
        <div className="act-shell">
          <aside className="act-rail">
            <div className="ps-eyebrow">Action items</div>
            <h1 className="act-title">Action items</h1>
            <div className="act-rail-section">
              <div className="act-rail-label">View</div>
              <div className="act-view-toggle">
                {[
                  ["matrix", "Matrix"],
                  ["list", "List"],
                  ["all", "All"],
                ].map(([id, l]) => (
                  <button
                    key={id}
                    className={"act-vtog" + (view === id ? " active" : "")}
                    onClick={() => setView(id)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="act-rail-section">
              <div className="act-rail-label">
                Group by <span className="act-rail-hint">(list view)</span>
              </div>
              <div className="act-group-toggle">
                {[
                  ["project", "Project"],
                  ["priority", "Priority"],
                  ["date", "Due date"],
                ].map(([id, l]) => (
                  <button
                    key={id}
                    className={"act-gtog" + (groupBy === id ? " active" : "")}
                    onClick={() => setGroupBy(id)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="act-rail-section">
              <div className="act-rail-label-row">
                <span className="act-rail-label">Priority</span>
                {priorityFilter.length > 0 && (
                  <button
                    className="act-rail-clear"
                    onClick={() => setPriorityFilter([])}
                  >
                    clear
                  </button>
                )}
              </div>
              <div className="act-pri-rows">
                {["P0", "P1", "P2", "P3"].map((p) => {
                  const on = priorityFilter.includes(p);
                  return (
                    <button
                      key={p}
                      className={"act-pri-row" + (on ? " on" : "")}
                      onClick={() => togglePriorityFilter(p)}
                    >
                      <span
                        className="act-pri-badge"
                        style={{ background: PRI_META[p].color }}
                      />
                      <span className="act-pri-code">{p}</span>
                      <span className="act-pri-label">{PRI_META[p].label}</span>
                      <span className="act-pri-count">{counts.pri[p]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="act-rail-section">
              <div className="act-rail-label-row">
                <span className="act-rail-label">Projects</span>
                {projectFilter.length > 0 && (
                  <button
                    className="act-rail-clear"
                    onClick={() => setProjectFilter([])}
                  >
                    clear
                  </button>
                )}
              </div>
              <div className="act-proj-list">
                {categories
                  .filter((c) => counts.proj[c.id])
                  .map((c) => {
                    const on = projectFilter.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        className={"act-proj-row" + (on ? " on" : "")}
                        onClick={() => toggleProjectFilter(c.id)}
                      >
                        <span
                          className="act-proj-dot"
                          style={{ background: colorMap[c.id] }}
                        />
                        <span className="act-proj-name">{c.name}</span>
                        <span className="act-proj-count">{counts.proj[c.id]}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
            <div className="act-rail-section">
              <label className="act-check-row">
                <input
                  type="checkbox"
                  checked={hideDone}
                  onChange={(e) => setHideDone(e.target.checked)}
                />
                <span>Hide completed</span>
              </label>
              <div className="act-rail-foot">
                {visible.length} of {tasks.length} tasks
              </div>
            </div>
          </aside>

          <main className="act-main">
            {error && <div className="today-error">{error}</div>}
            {loading ? (
              <div className="act-empty">Loading…</div>
            ) : view === "matrix" ? (
              <div className="act-matrix">
                {[
                  { key: "q1", items: matrixBuckets.q1, label: "Do now", note: "Urgent & important", variant: "clay" },
                  { key: "q2", items: matrixBuckets.q2, label: "Schedule", note: "Important, not urgent", variant: "accent" },
                  { key: "q3", items: matrixBuckets.q3, label: "Quick wins", note: "Urgent, not important", variant: "indigo" },
                  { key: "q4", items: matrixBuckets.q4, label: "Drop or defer", note: "Neither urgent nor important" },
                ].map((q) => (
                  <div
                    key={q.key}
                    className={"act-q" + (q.variant ? " act-q--" + q.variant : "")}
                  >
                    <div className="act-q-head">
                      <div className="act-q-title">{q.label}</div>
                      <div className="act-q-note">{q.note}</div>
                      <div className="act-q-count">{q.items.length}</div>
                    </div>
                    <div className="act-q-items">
                      {q.items.length === 0 ? (
                        <div className="act-q-empty">—</div>
                      ) : (
                        q.items.slice(0, 24).map((t) => <TaskRow key={t.id} t={t} />)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : view === "list" ? (
              <div className="act-groups">
                {grouped.map((g) => (
                  <div key={g.key} className="act-group">
                    <div className="act-group-head">
                      <span
                        className="act-group-stripe"
                        style={{ background: g.color }}
                      />
                      <div className="act-group-label">{g.label}</div>
                      <div className="act-group-count">{g.items.length}</div>
                    </div>
                    <div className="act-group-items">
                      {g.items.map((t) => <TaskRow key={t.id} t={t} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="act-group">
                <div className="act-group-items">
                  {visible.map((t) => <TaskRow key={t.id} t={t} />)}
                </div>
              </div>
            )}
          </main>

          {view !== "matrix" && selected && (
            <aside className="act-inspect">
              <div className="act-inspect-head">
                <div className="act-inspect-breadcrumb">
                  {catMap[selected.category_id]?.name || "—"}
                </div>
                <div
                  className="act-inspect-pri"
                  style={{ background: PRI_META[toCode(selected.priority)].soft, color: PRI_META[toCode(selected.priority)].color }}
                >
                  {toCode(selected.priority)} · {PRI_META[toCode(selected.priority)].label}
                </div>
              </div>
              <h2 className="act-inspect-title">{selected.title}</h2>
              <div className="act-inspect-stats">
                {selected.effort_hours > 0 && (
                  <div className="act-stat">
                    <div className="act-stat-label">Effort</div>
                    <div className="act-stat-v">{Math.round(selected.effort_hours * 60)}m</div>
                  </div>
                )}
                {selected.due_date && (
                  <div className="act-stat">
                    <div className="act-stat-label">Due</div>
                    <div className="act-stat-v">{fmtDue(selected.due_date)}</div>
                  </div>
                )}
                <div className="act-stat">
                  <div className="act-stat-label">Status</div>
                  <div className="act-stat-v">{selected.status}</div>
                </div>
              </div>
              <div className="act-inspect-actions">
                <button
                  className="ps-btn ps-btn--primary"
                  onClick={() => toggleStatus(selected)}
                >
                  {selected.status === "done" ? "Mark open" : "Complete"}
                </button>
                <button
                  className="ps-btn"
                  onClick={() => setSelectedId(null)}
                >
                  Close
                </button>
              </div>
            </aside>
          )}
        </div>

      <style jsx global>{`
        .act-shell {
          display: grid;
          grid-template-columns: 260px 1fr 320px;
          gap: 24px;
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 24px 80px;
        }
        .act-shell:not(:has(.act-inspect)) { grid-template-columns: 260px 1fr; }
        .act-title {
          font-family: var(--ps-serif);
          font-size: 26px;
          margin: 0 0 18px;
          letter-spacing: -0.02em;
        }
        .act-rail {
          display: flex;
          flex-direction: column;
          gap: 18px;
          position: sticky;
          top: 0;
          align-self: start;
        }
        .act-rail-section { display: flex; flex-direction: column; gap: 8px; }
        .act-rail-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .act-rail-label-row { display: flex; justify-content: space-between; align-items: center; }
        .act-rail-hint { font-size: 9px; font-weight: 400; opacity: 0.7; margin-left: 4px; }
        .act-rail-clear {
          appearance: none;
          border: none;
          background: transparent;
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          cursor: pointer;
        }
        .act-rail-clear:hover { color: var(--ps-ink); }
        .act-view-toggle, .act-group-toggle {
          display: flex;
          gap: 2px;
          background: var(--ps-paper);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid var(--ps-ink-08);
        }
        .act-vtog, .act-gtog {
          flex: 1;
          appearance: none;
          border: none;
          background: transparent;
          padding: 6px 10px;
          border-radius: 5px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
        }
        .act-vtog.active, .act-gtog.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
        }
        .act-pri-rows, .act-proj-list { display: flex; flex-direction: column; gap: 2px; }
        .act-pri-row, .act-proj-row {
          appearance: none;
          border: none;
          background: transparent;
          display: grid;
          grid-template-columns: 8px auto 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 5px 8px;
          border-radius: 6px;
          cursor: pointer;
          width: 100%;
          text-align: left;
          font-family: inherit;
          color: var(--ps-ink-70);
          font-size: 12.5px;
        }
        .act-pri-row:hover, .act-proj-row:hover { background: var(--ps-ink-05); color: var(--ps-ink); }
        .act-pri-row.on, .act-proj-row.on { background: var(--ps-ink); color: var(--ps-bg); }
        .act-pri-row.on .act-pri-count, .act-proj-row.on .act-proj-count { color: rgba(250,247,242,0.6); }
        .act-pri-badge {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .act-pri-code {
          font-family: var(--ps-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .act-pri-label { font-size: 12px; }
        .act-pri-count, .act-proj-count {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-40);
        }
        .act-proj-dot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
        }
        .act-proj-name {
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .act-check-row {
          display: flex;
          gap: 8px;
          align-items: center;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
        }
        .act-check-row input { accent-color: var(--ps-accent); }
        .act-rail-foot {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          padding-top: 8px;
          border-top: 1px solid var(--ps-ink-08);
        }
        .act-main { min-width: 0; }
        .act-empty {
          padding: 40px;
          text-align: center;
          color: var(--ps-ink-60);
          font-size: 13px;
        }
        .act-matrix {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 14px;
          min-height: 600px;
        }
        .act-q {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .act-q--clay { background: var(--ps-clay-soft); border-color: rgba(184,92,62,0.18); }
        .act-q--accent { background: var(--ps-accent-soft); border-color: rgba(185,115,22,0.2); }
        .act-q--indigo { background: var(--ps-indigo-soft); border-color: rgba(74,107,143,0.2); }
        .act-q-head { display: flex; align-items: baseline; gap: 8px; }
        .act-q-title {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .act-q-note {
          font-size: 11px;
          color: var(--ps-ink-60);
          font-style: italic;
        }
        .act-q-count {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-50);
        }
        .act-q-items { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 320px; }
        .act-q-empty {
          font-family: var(--ps-serif);
          font-size: 22px;
          color: var(--ps-ink-30);
          text-align: center;
          padding: 20px;
        }
        .act-groups { display: flex; flex-direction: column; gap: 24px; }
        .act-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .act-group-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px solid var(--ps-ink-10);
          margin-bottom: 4px;
        }
        .act-group-stripe {
          width: 3px;
          height: 16px;
          border-radius: 2px;
        }
        .act-group-label {
          font-family: var(--ps-serif);
          font-size: 15px;
          letter-spacing: -0.01em;
        }
        .act-group-count {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .act-group-items { display: flex; flex-direction: column; gap: 4px; }
        .act-row {
          appearance: none;
          width: 100%;
          border: 1px solid var(--ps-ink-08);
          background: #fff;
          border-radius: 10px;
          padding: 10px 12px;
          display: grid;
          grid-template-columns: 32px 10px 1fr 28px;
          gap: 10px;
          align-items: center;
          cursor: pointer;
          text-align: left;
          transition: border-color 120ms;
        }
        .act-row:hover { border-color: var(--ps-ink-30); }
        .act-row.selected { border-color: var(--ps-accent); box-shadow: 0 0 0 3px var(--ps-accent-soft); }
        .act-row.done { opacity: 0.5; }
        .act-row-pri {
          font-family: var(--ps-mono);
          font-size: 9px;
          font-weight: 700;
          color: #fff;
          padding: 3px 6px;
          border-radius: 4px;
          text-align: center;
          letter-spacing: 0.04em;
        }
        .act-row-dot {
          width: 10px;
          height: 10px;
          border-radius: 2px;
        }
        .act-row-body { min-width: 0; }
        .act-row-title {
          font-size: 13.5px;
          color: var(--ps-ink);
          font-weight: 450;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 2px;
        }
        .act-row.done .act-row-title { text-decoration: line-through; }
        .act-row-meta {
          display: flex;
          gap: 10px;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
        }
        .act-row-due { color: var(--ps-clay); }
        .act-check {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          border: 1.5px solid var(--ps-ink-30);
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--ps-bg);
          cursor: pointer;
        }
        .act-check.checked { background: var(--ps-sage); border-color: var(--ps-sage); }
        .act-inspect {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          padding: 18px 20px;
          position: sticky;
          top: 0;
          align-self: start;
          max-height: calc(100vh - 80px);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .act-inspect-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .act-inspect-breadcrumb {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .act-inspect-pri {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .act-inspect-title {
          font-family: var(--ps-serif);
          font-size: 22px;
          letter-spacing: -0.015em;
          line-height: 1.25;
          margin: 0;
        }
        .act-inspect-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .act-stat {
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          padding: 8px 10px;
        }
        .act-stat-label {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .act-stat-v {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
          margin-top: 4px;
        }
        .act-inspect-actions { display: flex; gap: 8px; }
        @media (max-width: 1280px) {
          .act-shell { grid-template-columns: 240px 1fr !important; }
          .act-inspect { grid-column: 1 / -1; position: static; max-height: none; }
        }
        @media (max-width: 900px) {
          .act-shell { grid-template-columns: 1fr !important; padding: 16px; }
          .act-rail { position: static; }
          .act-matrix { grid-template-columns: 1fr; min-height: unset; }
        }
      `}</style>
    </PSShell>
  );
}
