import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import {
  getWeeklyReview,
  upsertWeeklyReview,
  listWeeklyReviews,
  getWeeklyImprovementRun,
} from "../lib/db";

function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7; // Sunday=7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toStr = (x) => x.toISOString().slice(0, 10);
  return { start: toStr(monday), end: toStr(sunday) };
}

export default function WeeklyReviewPage() {
  const { user, isCheckingAuth } = useAuth();
  const DEFAULT_NEEDS = {
    certainty: 5,
    variety: 5,
    significance: 5,
    connection: 5,
    growth: 5,
    contribution: 5,
  };
  const [wins, setWins] = useState("");
  const [friction, setFriction] = useState("");
  const [reality, setReality] = useState("");
  const [needs, setNeeds] = useState(DEFAULT_NEEDS);
  const [lowestNeedAction, setLowestNeedAction] = useState("");
  const [topLeverage, setTopLeverage] = useState("");
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [currentWeekStart, setCurrentWeekStart] = useState(
    getWeekRange(new Date()).start
  );
  const [pastReviews, setPastReviews] = useState([]);
  const [activeTab, setActiveTab] = useState("reflect");
  const [coachRun, setCoachRun] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachApplying, setCoachApplying] = useState(false);
  const [coachError, setCoachError] = useState("");
  const [coachMeta, setCoachMeta] = useState(null);
  const [selectedActionIds, setSelectedActionIds] = useState([]);

  const { start, end } = useMemo(
    () => getWeekRange(new Date(currentWeekStart)),
    [currentWeekStart]
  );

  const coachGroups = useMemo(() => {
    const ai = coachRun?.ai_output || coachRun?.coach || {};
    return [
      { key: "project_fixes", label: "Project fixes", items: ai.project_fixes || [] },
      { key: "alignment_fixes", label: "Alignment fixes", items: ai.alignment_fixes || [] },
      { key: "subtask_suggestions", label: "Subtask suggestions", items: ai.subtask_suggestions || [] },
      { key: "priority_adjustments", label: "Priority adjustments", items: ai.priority_adjustments || [] },
    ].filter((group) => group.items.length > 0);
  }, [coachRun]);

  const coachActionIds = useMemo(
    () => coachGroups.flatMap((group) => group.items.map((item) => item.id)).filter(Boolean),
    [coachGroups]
  );

  useEffect(() => {
    if (!user) return;

    async function loadCurrent() {
      setLoadError("");
      try {
        const [res, coachRes] = await Promise.all([
          getWeeklyReview(user.id, currentWeekStart),
          getWeeklyImprovementRun(user.id, currentWeekStart),
        ]);
        setCoachRun(coachRes?.data || null);
        if (!res.error && res.data) {
          const row = res.data;
          const parsed =
            typeof row.notes === "string"
              ? (() => {
                  try {
                    return JSON.parse(row.notes);
                  } catch {
                    return {};
                  }
                })()
              : row.notes || {};
          setWins(parsed.wins || "");
          setFriction(parsed.friction || "");
          setReality(parsed.reality_check || "");
          setNeeds(row.scores || DEFAULT_NEEDS);
          setLowestNeedAction(
            (parsed.lowest_need_focus && parsed.lowest_need_focus.action) || ""
          );
          setTopLeverage(
            (parsed.weekly_theme && parsed.weekly_theme.why) || ""
          );
          setTheme((parsed.weekly_theme && parsed.weekly_theme.theme) || "");
          setNotes(parsed.week_summary || "");
        } else {
          // No existing review; clear fields for this week
          setWins("");
          setFriction("");
          setReality("");
          setNeeds(DEFAULT_NEEDS);
          setLowestNeedAction("");
          setTopLeverage("");
          setTheme("");
          setNotes("");
        }
      } catch (e) {
        setLoadError(e.message || "Failed to load weekly review.");
      }
    }

    async function loadList() {
      const res = await listWeeklyReviews(user.id, 20);
      if (!res.error) {
        setPastReviews(res.data || []);
      }
    }

    loadCurrent();
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentWeekStart]);

  useEffect(() => {
    setSelectedActionIds([]);
    setCoachError("");
  }, [coachRun?.id]);

  if (isCheckingAuth || !user) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
      </DashboardLayout>
    );
  }

  const lowestNeedKey = Object.entries(needs).reduce(
    (acc, [key, value]) => (value < acc.value ? { key, value } : acc),
    { key: "certainty", value: needs.certainty }
  ).key;

  function handleNeedChange(key, value) {
    const v = Number.isNaN(Number(value)) ? 0 : Math.min(10, Math.max(1, Number(value)));
    setNeeds((prev) => ({ ...prev, [key]: v }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage("");
    const payload = {
      week_summary: notes || "",
      wins,
      friction,
      reality_check: reality,
      updated_human_needs: needs,
      lowest_need_focus: {
        need: lowestNeedKey,
        action: lowestNeedAction,
      },
      weekly_theme: {
        theme: theme || "",
        why: topLeverage || "",
      },
    };
    upsertWeeklyReview(user.id, start, payload)
      .then((res) => {
        if (res.error) {
          setLoadError(res.error.message || "Failed to save weekly review.");
        } else {
          setSaveMessage("Saved. You can come back and edit anytime.");
        }
      })
      .finally(() => {
        setSaving(false);
      });
  }

  async function handleGenerateCoach() {
    if (!user) return;
    setCoachLoading(true);
    setCoachError("");
    try {
      const response = await fetch("/api/weekly-review/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: start }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to generate weekly coach.");
      setCoachRun(payload.run || null);
      setCoachMeta(payload.meta || null);
      setActiveTab("improve");
    } catch (e) {
      setCoachError(e.message || "Failed to generate weekly coach.");
    } finally {
      setCoachLoading(false);
    }
  }

  async function handleApplyCoach() {
    if (!user || !coachRun) return;
    setCoachApplying(true);
    setCoachError("");
    try {
      const rejected = coachActionIds.filter((id) => !selectedActionIds.includes(id));
      const response = await fetch("/api/weekly-review/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_start: start,
          accepted_action_ids: selectedActionIds,
          rejected_action_ids: rejected,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to apply weekly improvements.");
      setCoachRun(payload.run || coachRun);
      setSaveMessage("Selected improvements applied.");
    } catch (e) {
      setCoachError(e.message || "Failed to apply weekly improvements.");
    } finally {
      setCoachApplying(false);
    }
  }

  function toggleAction(actionId) {
    setSelectedActionIds((prev) =>
      prev.includes(actionId)
        ? prev.filter((id) => id !== actionId)
        : [...prev, actionId]
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Recursive improvement"
        title="Weekly review"
        subtitle={`Calm operator check-in for ${start} to ${end}. Reflect on the week, then generate improvement suggestions for structure, alignment, and momentum.`}
        right={
          <button
            type="button"
            className="rs-btn-ghost"
            onClick={handleGenerateCoach}
            disabled={coachLoading}
          >
            {coachLoading ? "Generating…" : coachRun ? "Refresh improvement coach" : "Generate improvement coach"}
          </button>
        }
      />

      <section className="rs-weekly-review-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`rs-filter-pill${activeTab === "reflect" ? " rs-filter-pill--active" : ""}`}
              onClick={() => setActiveTab("reflect")}
            >
              Reflect
            </button>
            <button
              type="button"
              className={`rs-filter-pill${activeTab === "improve" ? " rs-filter-pill--active" : ""}`}
              onClick={() => setActiveTab("improve")}
            >
              Improve
            </button>
          </div>

          {(loadError || coachError) && (
            <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{loadError || coachError}</p>
          )}

          {activeTab === "reflect" ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Wins</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
                  What are 1–3 wins from this week? What moved the needle?
                </p>
                <textarea value={wins} onChange={(e) => setWins(e.target.value)} rows={3} style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Friction</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
                  What felt heavy or repeatedly avoided? Why?
                </p>
                <textarea value={friction} onChange={(e) => setFriction(e.target.value)} rows={3} style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Reality check</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
                  What changed in your life context (time, energy, constraints)?
                </p>
                <textarea value={reality} onChange={(e) => setReality(e.target.value)} rows={3} style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Six Human Needs (1–10)</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
                  Re-rate each need. Then describe one healthy action to raise your lowest-scoring need by 1 point next week.
                </p>
                <div className="rs-weekly-needs-grid">
                  {Object.keys(needs).map((key) => (
                    <label key={key} style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#4b5563", gap: 4 }}>
                      <span style={{ textTransform: "capitalize" }}>{key}</span>
                      <input type="number" min={1} max={10} value={needs[key]} onChange={(e) => handleNeedChange(key, e.target.value)} style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                    </label>
                  ))}
                </div>
                <textarea value={lowestNeedAction} onChange={(e) => setLowestNeedAction(e.target.value)} rows={2} placeholder="What healthy action could raise your lowest need by 1 point?" style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Top leverage</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
                  If you could complete one high-leverage action next week, what would it be?
                </p>
                <textarea value={topLeverage} onChange={(e) => setTopLeverage(e.target.value)} rows={2} style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Next week theme</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
                  Choose a theme such as Business, Rental House, Health, Family, etc.
                </p>
                <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Rental House" style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Notes / summary</h2>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <button type="submit" disabled={saving} style={{ fontSize: 13, padding: "8px 14px", borderRadius: 999, border: "1px solid #111827", background: "#111827", color: "#ffffff", cursor: saving ? "wait" : "pointer" }}>
                  {saving ? "Saving…" : "Save weekly review"}
                </button>
                {saveMessage && (
                  <span style={{ fontSize: 12, color: "#059669" }}>
                    {saveMessage}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!coachRun ? (
                <div className="rs-section-card">
                  <h2 className="rs-section-card__title">Improvement coach</h2>
                  <p className="rs-section-card__subtitle">
                    Generate a weekly bundle of approval-based suggestions for project structure, task alignment, subtasks, and priority cleanup.
                  </p>
                  <button type="button" className="rs-btn-ghost" onClick={handleGenerateCoach} disabled={coachLoading}>
                    {coachLoading ? "Generating…" : "Generate weekly improvement coach"}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                    <div className="rs-section-card" style={{ marginBottom: 0 }}>
                      <h3 className="rs-section-card__title" style={{ fontSize: "0.95rem" }}>Momentum score</h3>
                      <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{coachRun.context_json?.overview?.momentum_score ?? "—"}</p>
                    </div>
                    <div className="rs-section-card" style={{ marginBottom: 0 }}>
                      <h3 className="rs-section-card__title" style={{ fontSize: "0.95rem" }}>Alignment</h3>
                      <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{coachRun.context_json?.overview?.alignment_coverage_pct ?? 0}%</p>
                    </div>
                    <div className="rs-section-card" style={{ marginBottom: 0 }}>
                      <h3 className="rs-section-card__title" style={{ fontSize: "0.95rem" }}>Overdue</h3>
                      <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{coachRun.context_json?.overview?.overdue_count ?? 0}</p>
                    </div>
                    <div className="rs-section-card" style={{ marginBottom: 0 }}>
                      <h3 className="rs-section-card__title" style={{ fontSize: "0.95rem" }}>Stale doing</h3>
                      <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{coachRun.context_json?.overview?.stale_doing_count ?? 0}</p>
                    </div>
                  </div>

                  <div className="rs-section-card" style={{ marginBottom: 0 }}>
                    <h2 className="rs-section-card__title">Weekly recommendation</h2>
                    <p className="rs-section-card__subtitle" style={{ marginBottom: 10 }}>
                      {coachRun.ai_output?.summary || "No summary yet."}
                    </p>
                    {coachRun.ai_output?.next_week_focus && (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--rs-on-surface-variant)" }}>
                        <strong>{coachRun.ai_output.next_week_focus.theme || "Focus"}:</strong>{" "}
                        {coachRun.ai_output.next_week_focus.why || ""}
                      </p>
                    )}
                    {coachMeta && (
                      <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--rs-on-surface-variant)" }}>
                        {coachMeta.ai_status} · {coachMeta.prompt_version}
                      </p>
                    )}
                  </div>

                  {coachGroups.map((group) => (
                    <div key={group.key} className="rs-section-card" style={{ marginBottom: 0 }}>
                      <h3 className="rs-section-card__title" style={{ fontSize: "1rem" }}>{group.label}</h3>
                      <div style={{ display: "grid", gap: 10 }}>
                        {group.items.map((item) => (
                          <label
                            key={item.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "20px minmax(0, 1fr)",
                              gap: 10,
                              alignItems: "start",
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid #e5e7eb",
                              background: selectedActionIds.includes(item.id) ? "#fffbeb" : "#ffffff",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedActionIds.includes(item.id)}
                              onChange={() => toggleAction(item.id)}
                              style={{ marginTop: 3 }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>{item.title}</p>
                              <p style={{ margin: 0, fontSize: 13, color: "var(--rs-on-surface-variant)" }}>{item.summary}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  {Array.isArray(coachRun.ai_output?.app_improvement_suggestions) && coachRun.ai_output.app_improvement_suggestions.length > 0 && (
                    <div className="rs-section-card" style={{ marginBottom: 0 }}>
                      <h3 className="rs-section-card__title" style={{ fontSize: "1rem" }}>App-improvement observations</h3>
                      <div style={{ display: "grid", gap: 8 }}>
                        {coachRun.ai_output.app_improvement_suggestions.map((item) => (
                          <div key={item.id} style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>{item.title}</p>
                            <p style={{ margin: 0, fontSize: 13, color: "var(--rs-on-surface-variant)" }}>{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button type="button" className="rs-btn-primary" onClick={handleApplyCoach} disabled={coachApplying || selectedActionIds.length === 0}>
                      {coachApplying ? "Applying…" : `Apply ${selectedActionIds.length} selected improvement${selectedActionIds.length === 1 ? "" : "s"}`}
                    </button>
                    <button type="button" className="rs-btn-ghost" onClick={handleGenerateCoach} disabled={coachLoading}>
                      Refresh coach
                    </button>
                    {coachRun?.result_metrics?.applied_count > 0 && (
                      <span style={{ fontSize: 12, color: "#059669" }}>
                        {coachRun.result_metrics.applied_count} improvement{coachRun.result_metrics.applied_count === 1 ? "" : "s"} applied
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="rs-weekly-review-aside">
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
            Past reviews
          </h2>
          {pastReviews.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              No reviews yet. Save this week&apos;s review to start your history.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {pastReviews.map((row) => {
                const parsed =
                  typeof row.notes === "string"
                    ? (() => {
                        try {
                          return JSON.parse(row.notes);
                        } catch {
                          return {};
                        }
                      })()
                    : row.notes || {};
                const labelTheme =
                  (parsed.weekly_theme && parsed.weekly_theme.theme) || "";
                const active = row.week_start === start;
                return (
                  <li key={row.week_start} style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      onClick={() => setCurrentWeekStart(row.week_start)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        fontSize: 12,
                        padding: "6px 8px",
                        borderRadius: 999,
                        border: "1px solid",
                        borderColor: active ? "#111827" : "#e5e7eb",
                        background: active ? "#111827" : "#ffffff",
                        color: active ? "#ffffff" : "#111827",
                        cursor: "pointer",
                      }}
                    >
                      Week of {row.week_start}
                      {labelTheme ? ` – ${labelTheme}` : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setCurrentWeekStart(getWeekRange(new Date()).start)}
            style={{
              marginTop: 10,
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Jump to current week
          </button>
          {coachRun && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>Improvement status</h3>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>
                Accepted: {Array.isArray(coachRun.accepted_action_ids) ? coachRun.accepted_action_ids.length : 0}
              </p>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>
                Applied: {Array.isArray(coachRun.applied_action_ids) ? coachRun.applied_action_ids.length : 0}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                Rejected: {Array.isArray(coachRun.rejected_action_ids) ? coachRun.rejected_action_ids.length : 0}
              </p>
            </div>
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}

