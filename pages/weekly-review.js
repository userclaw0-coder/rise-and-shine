import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import {
  getWeeklyReview,
  upsertWeeklyReview,
  listWeeklyReviews,
} from "../lib/db";

const NEEDS = [
  { id: "growth", label: "Growth", color: "var(--ps-indigo)" },
  { id: "variety", label: "Variety", color: "var(--ps-plum)" },
  { id: "certainty", label: "Certainty", color: "var(--ps-gold)" },
  { id: "connection", label: "Connection", color: "var(--ps-clay)" },
  { id: "contribution", label: "Contribution", color: "var(--ps-sage)" },
  { id: "significance", label: "Significance", color: "var(--ps-accent)" },
];

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

function parseNotes(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { week_summary: String(raw) };
  }
}

function Field({ label, sub, value, onChange, onDraft, drafting, placeholder, color, oneLine, large }) {
  return (
    <div className="wr-field" style={{ borderLeftColor: color }}>
      <div className="wr-field-head">
        <div>
          <div className="wr-field-label">{label}</div>
          <div className="wr-field-sub">{sub}</div>
        </div>
        <button
          type="button"
          className="wr-draft-btn"
          onClick={onDraft}
          disabled={drafting || !onDraft}
        >
          {drafting ? "Drafting…" : value?.trim() ? "AI append" : "AI draft"}
        </button>
      </div>
      {oneLine ? (
        <input
          className="wr-field-input"
          placeholder={placeholder}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <textarea
          className={"wr-field-body" + (large ? " large" : "")}
          placeholder={placeholder}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function WeeklyReviewPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [mode, setMode] = useState("reflect");
  const [wins, setWins] = useState("");
  const [friction, setFriction] = useState("");
  const [reality, setReality] = useState("");
  const [leverage, setLeverage] = useState("");
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [lowestAction, setLowestAction] = useState("");
  const [needs, setNeeds] = useState(() =>
    Object.fromEntries(NEEDS.map((n) => [n.id, 5]))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [drafting, setDrafting] = useState(null);
  const [pastReviews, setPastReviews] = useState([]);
  const [projectMovement, setProjectMovement] = useState([]);
  const saveTimer = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rs-wr-mode");
      if (saved) setMode(saved);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("rs-wr-mode", mode);
    } catch {
      // no-op
    }
  }, [mode]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [curRes, pastRes] = await Promise.all([
        getWeeklyReview(user.id, weekStart),
        listWeeklyReviews(user.id, 8),
      ]);
      if (cancelled) return;
      if (curRes.data) {
        const n = parseNotes(curRes.data.notes);
        setWins(n.wins || "");
        setFriction(n.friction || "");
        setReality(n.reality_check || "");
        setLeverage(n.top_leverage || n.lowest_need_focus?.action || "");
        setTheme(n.weekly_theme || n.next_week_theme || "");
        setNotes(n.week_summary || "");
        setLowestAction(n.lowest_need_focus?.action || "");
        setNeeds({
          ...Object.fromEntries(NEEDS.map((x) => [x.id, 5])),
          ...(curRes.data.scores || {}),
        });
      } else {
        setWins("");
        setFriction("");
        setReality("");
        setLeverage("");
        setTheme("");
        setNotes("");
        setLowestAction("");
        setNeeds(Object.fromEntries(NEEDS.map((n) => [n.id, 5])));
      }
      if (!pastRes.error) setPastReviews(pastRes.data || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, weekStart]);

  useEffect(() => {
    if (!user || loading) return;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await upsertWeeklyReview(user.id, weekStart, {
        updated_human_needs: needs,
        wins,
        friction,
        reality_check: reality,
        week_summary: notes,
        lowest_need_focus: lowestAction ? { action: lowestAction } : null,
        weekly_theme: theme,
      });
      setSaving(false);
      setLastSaved(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [user, weekStart, wins, friction, reality, leverage, theme, notes, lowestAction, needs, loading]);

  const loadMovement = useCallback(async () => {
    if (!user) return;
    const weekEnd = (() => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    })();
    const [cats, events] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name", { ascending: true }),
      supabase
        .from("task_events")
        .select("task_id, event_type, created_at")
        .eq("user_id", user.id)
        .eq("event_type", "completed")
        .gte("created_at", `${weekStart}T00:00:00Z`)
        .lt("created_at", `${weekEnd}T00:00:00Z`),
    ]);
    const catList = cats.data || [];
    const taskIds = [...new Set((events.data || []).map((e) => e.task_id))];
    if (taskIds.length === 0) {
      setProjectMovement(catList.map((c) => ({ id: c.id, label: c.name, moved: 0 })));
      return;
    }
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, category_id")
      .in("id", taskIds);
    const counts = {};
    for (const ev of events.data || []) {
      const t = (taskRows || []).find((tr) => tr.id === ev.task_id);
      if (t?.category_id) counts[t.category_id] = (counts[t.category_id] || 0) + 1;
    }
    setProjectMovement(
      catList.map((c) => ({ id: c.id, label: c.name, moved: counts[c.id] || 0 }))
    );
  }, [user, weekStart]);

  useEffect(() => {
    loadMovement();
  }, [loadMovement]);

  const movementMax = Math.max(1, ...projectMovement.map((p) => p.moved));

  async function draftWith(sectionKey) {
    if (!user || drafting) return;
    setDrafting(sectionKey);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/weekly-review/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          week_start: weekStart,
          section: sectionKey,
        }),
      });
      if (!res.ok) throw new Error("draft failed");
      const data = await res.json();
      const text =
        data?.draft ||
        data?.content ||
        data?.sections?.[sectionKey] ||
        data?.text ||
        "";
      if (text) {
        appendSection(sectionKey, text);
      }
    } catch {
      // silent — no fallback content to keep it honest
    } finally {
      setDrafting(null);
    }
  }

  function appendSection(key, text) {
    const joiner = (existing) => (existing?.trim() ? existing + "\n\n" + text : text);
    if (key === "wins") setWins(joiner);
    else if (key === "friction") setFriction(joiner);
    else if (key === "reality") setReality(joiner);
    else if (key === "leverage") setLeverage(joiner);
    else if (key === "theme") setTheme(joiner);
    else if (key === "notes") setNotes(joiner);
  }

  const weekLabel = useMemo(() => {
    const s = new Date(weekStart + "T00:00:00");
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    const fmt = (d) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(s)} – ${fmt(e)}`;
  }, [weekStart]);

  if (!user) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>Weekly review · Rise &amp; Shine</title>
      </Head>
      <div className="ps-page">
        <div className="wr-shell">
          <div className="wr-main">
            <div className="ps-eyebrow">Weekly review · week of {weekLabel}</div>
            <div className="wr-title-row">
              <h1 className="ps-title" style={{ marginBottom: 0 }}>
                This week, in your own words.
              </h1>
              <div className="wr-autosave">
                <span
                  className={"wr-save-dot" + (saving ? " saving" : "")}
                />
                {saving
                  ? "Saving…"
                  : lastSaved
                  ? "Saved at " + lastSaved
                  : "Autosave on"}
              </div>
            </div>

            <div className="wr-mode-toggle">
              <button
                className={mode === "reflect" ? "active" : ""}
                onClick={() => setMode("reflect")}
              >
                Reflect
              </button>
              <button
                className={mode === "improve" ? "active" : ""}
                onClick={() => setMode("improve")}
              >
                Improve
              </button>
              <div className="wr-mode-sub">
                {mode === "reflect"
                  ? "Look back · what happened · what moved · what stuck"
                  : "Look forward · what to change · how to aim the next week"}
              </div>
            </div>

            {mode === "reflect" ? (
              <>
                <Field
                  label="Wins"
                  sub="What are 1–3 wins from this week? What moved the needle?"
                  value={wins}
                  onChange={setWins}
                  onDraft={() => draftWith("wins")}
                  drafting={drafting === "wins"}
                  placeholder="List what moved. The AI can pull from your projects if you'd like a starter draft."
                  color="var(--ps-sage)"
                />
                <Field
                  label="Friction"
                  sub="What felt heavy or repeatedly avoided? Why?"
                  value={friction}
                  onChange={setFriction}
                  onDraft={() => draftWith("friction")}
                  drafting={drafting === "friction"}
                  placeholder="Be honest. This is where compounding leaks happen."
                  color="var(--ps-clay)"
                />
                <Field
                  label="Reality check"
                  sub="What changed in your life context — time, energy, constraints?"
                  value={reality}
                  onChange={setReality}
                  onDraft={() => draftWith("reality")}
                  drafting={drafting === "reality"}
                  placeholder="New job? New caregiving load? Capital changes?"
                  color="var(--ps-indigo)"
                />
                <div className="wr-needs-block">
                  <div className="wr-field-head">
                    <div>
                      <div className="wr-field-label">Six human needs</div>
                      <div className="wr-field-sub">
                        Rate how each need felt this week (1–10).
                      </div>
                    </div>
                  </div>
                  <div className="wr-needs-grid">
                    {NEEDS.map((n) => (
                      <div className="wr-need" key={n.id}>
                        <div className="wr-need-row">
                          <div
                            className="wr-need-label"
                            style={{ color: n.color }}
                          >
                            {n.label}
                          </div>
                          <div className="wr-need-val">{needs[n.id] ?? 5}</div>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={needs[n.id] ?? 5}
                          onChange={(e) =>
                            setNeeds((prev) => ({
                              ...prev,
                              [n.id]: Number(e.target.value),
                            }))
                          }
                          style={{ accentColor: "var(--ps-accent)" }}
                        />
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="wr-field-body"
                    placeholder="One note about the lowest need — what small move would have shifted it?"
                    value={lowestAction}
                    onChange={(e) => setLowestAction(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Top leverage"
                  sub="If you could complete one high-leverage action next week, what would it be?"
                  value={leverage}
                  onChange={setLeverage}
                  onDraft={() => draftWith("leverage")}
                  drafting={drafting === "leverage"}
                  placeholder="The smallest move that cascades into the most downstream progress."
                  color="var(--ps-accent)"
                />
                <Field
                  label="Next week's theme"
                  sub="A one-line frame for the coming week."
                  value={theme}
                  onChange={setTheme}
                  onDraft={() => draftWith("theme")}
                  drafting={drafting === "theme"}
                  placeholder="Pick a theme the rest of the week orbits around."
                  color="var(--ps-plum)"
                  oneLine
                />
                <Field
                  label="Notes / summary"
                  sub="Anything else worth remembering — free-form."
                  value={notes}
                  onChange={setNotes}
                  onDraft={() => draftWith("notes")}
                  drafting={drafting === "notes"}
                  placeholder="Not required. But future-you often wants the context."
                  color="var(--ps-ink-50)"
                  large
                />
              </>
            )}
          </div>

          <aside className="wr-side">
            <div className="wr-card">
              <div className="wr-card-cap">What the system noticed</div>
              <div className="wr-card-note">
                Autosave keeps your writing safe. The movement chart below is
                computed from task completions this week.
              </div>
            </div>

            <div className="wr-card">
              <div className="wr-card-cap">Project movement · this week</div>
              <div className="wr-move-chart">
                {projectMovement.length === 0 ? (
                  <div className="wr-empty">No movement recorded yet.</div>
                ) : (
                  projectMovement.map((m) => (
                    <div className="wr-move-row" key={m.id}>
                      <div className="wr-move-label">{m.label}</div>
                      <div className="wr-move-bar">
                        <div
                          className="wr-move-fill"
                          style={{
                            width: (m.moved / movementMax) * 100 + "%",
                            background:
                              m.moved === 0
                                ? "var(--ps-ink-15)"
                                : "var(--ps-accent)",
                          }}
                        />
                      </div>
                      <div className="wr-move-num">{m.moved}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="wr-card">
              <div className="wr-card-cap">Past reviews</div>
              <div className="wr-past">
                {pastReviews.length === 0 ? (
                  <div className="wr-empty">No prior reviews yet.</div>
                ) : (
                  pastReviews.map((r) => {
                    const n = parseNotes(r.notes);
                    return (
                      <button
                        key={r.week_start}
                        className={
                          "wr-past-row" +
                          (r.week_start === weekStart ? " active" : "")
                        }
                        onClick={() => setWeekStart(r.week_start)}
                      >
                        <span className="wr-past-week">
                          {new Date(r.week_start + "T00:00:00").toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" }
                          )}
                        </span>
                        <span className="wr-past-tag">
                          {n.weekly_theme || n.next_week_theme || "—"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style jsx global>{`
        .wr-shell {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 32px;
          max-width: 1280px;
          margin: 0 auto;
          padding: 32px 24px 80px;
        }
        .wr-main { min-width: 0; }
        .wr-title-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 16px;
          flex-wrap: wrap;
        }
        .wr-autosave {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .wr-save-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ps-sage);
        }
        .wr-save-dot.saving {
          background: var(--ps-accent);
          animation: wr-pulse 1s infinite;
        }
        @keyframes wr-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .wr-mode-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 18px 0 22px;
          padding: 4px;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          width: fit-content;
          position: relative;
        }
        .wr-mode-toggle button {
          appearance: none;
          border: none;
          background: transparent;
          padding: 8px 16px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
        }
        .wr-mode-toggle button.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
        }
        .wr-mode-sub {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--ps-ink-50);
          padding-left: 8px;
        }
        .wr-field {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-left: 3px solid var(--ps-ink-15);
          border-radius: 10px;
          padding: 16px 18px;
          margin-bottom: 14px;
        }
        .wr-field-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 10px;
        }
        .wr-field-label {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
        }
        .wr-field-sub {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 2px;
        }
        .wr-draft-btn {
          appearance: none;
          border: 1px solid var(--ps-ink-15);
          background: transparent;
          padding: 5px 10px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
          white-space: nowrap;
        }
        .wr-draft-btn:hover { border-color: var(--ps-accent); color: var(--ps-accent); }
        .wr-draft-btn:disabled { opacity: 0.5; cursor: default; }
        .wr-field-body, .wr-field-input {
          width: 100%;
          appearance: none;
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--ps-mono);
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.55;
          padding: 4px 0;
          resize: vertical;
          min-height: 100px;
        }
        .wr-field-body.large { min-height: 160px; }
        .wr-field-input { min-height: 0; font-family: var(--ps-serif); font-size: 18px; letter-spacing: -0.01em; }
        .wr-field-body::placeholder, .wr-field-input::placeholder { color: var(--ps-ink-40); font-style: italic; }
        .wr-needs-block {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 16px 18px;
          margin-bottom: 14px;
        }
        .wr-needs-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px 18px;
          margin-bottom: 12px;
        }
        .wr-need-row { display: flex; justify-content: space-between; align-items: baseline; }
        .wr-need-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .wr-need-val {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
        }
        .wr-need input { width: 100%; }
        .wr-side {
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: sticky;
          top: 24px;
          align-self: start;
        }
        .wr-card {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .wr-card-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 8px;
        }
        .wr-card-note { font-size: 12px; color: var(--ps-ink-60); line-height: 1.5; }
        .wr-empty {
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
        }
        .wr-move-chart { display: flex; flex-direction: column; gap: 6px; }
        .wr-move-row {
          display: grid;
          grid-template-columns: 1fr 80px 24px;
          gap: 8px;
          align-items: center;
          font-size: 12px;
        }
        .wr-move-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--ps-ink-70);
        }
        .wr-move-bar {
          height: 6px;
          background: var(--ps-ink-08);
          border-radius: 3px;
          position: relative;
          overflow: hidden;
        }
        .wr-move-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
        .wr-move-num {
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-60);
          text-align: right;
        }
        .wr-past { display: flex; flex-direction: column; gap: 3px; }
        .wr-past-row {
          appearance: none;
          border: none;
          background: transparent;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          color: var(--ps-ink-70);
          font-size: 12px;
        }
        .wr-past-row:hover { background: var(--ps-ink-05); color: var(--ps-ink); }
        .wr-past-row.active { background: var(--ps-ink); color: var(--ps-bg); }
        .wr-past-week {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
        }
        .wr-past-tag {
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }
        @media (max-width: 1100px) {
          .wr-shell { grid-template-columns: 1fr; }
          .wr-side { position: static; }
          .wr-needs-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </DashboardLayout>
  );
}
