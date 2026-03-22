import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getWeeklyReview,
  upsertWeeklyReview,
  listWeeklyReviews,
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
  const [wins, setWins] = useState("");
  const [friction, setFriction] = useState("");
  const [reality, setReality] = useState("");
  const [needs, setNeeds] = useState({
    certainty: 5,
    variety: 5,
    significance: 5,
    connection: 5,
    growth: 5,
    contribution: 5,
  });
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

  const { start, end } = useMemo(
    () => getWeekRange(new Date(currentWeekStart)),
    [currentWeekStart]
  );

  useEffect(() => {
    if (!user) return;

    async function loadCurrent() {
      setLoadError("");
      try {
        const res = await getWeeklyReview(user.id, currentWeekStart);
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
          setNeeds(row.scores || needs);
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
          setNeeds({
            certainty: 5,
            variety: 5,
            significance: 5,
            connection: 5,
            growth: 5,
            contribution: 5,
          });
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

  return (
    <DashboardLayout>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Weekly review
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            Calm operator check-in for {start} to {end}.
          </p>
        </div>
      </div>

      <section className="rs-weekly-review-layout">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {loadError && (
            <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{loadError}</p>
          )}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Wins</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
              What are 1–3 wins from this week? What moved the needle?
            </p>
            <textarea
              value={wins}
              onChange={(e) => setWins(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Friction</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
              What felt heavy or repeatedly avoided? Why?
            </p>
            <textarea
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Reality check</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
              What changed in your life context (time, energy, constraints)?
            </p>
            <textarea
              value={reality}
              onChange={(e) => setReality(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Six Human Needs (1–10)</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
              Re-rate each need. Then describe one healthy action to raise your lowest-scoring need by 1 point next week.
            </p>
            <div className="rs-weekly-needs-grid">
              {Object.keys(needs).map((key) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    fontSize: 12,
                    color: "#4b5563",
                    gap: 4,
                  }}
                >
                  <span style={{ textTransform: "capitalize" }}>{key}</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={needs[key]}
                    onChange={(e) => handleNeedChange(key, e.target.value)}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      fontSize: 13,
                    }}
                  />
                </label>
              ))}
            </div>
            <textarea
              value={lowestNeedAction}
              onChange={(e) => setLowestNeedAction(e.target.value)}
              rows={2}
              placeholder="What healthy action could raise your lowest need by 1 point?"
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Top leverage</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
              If you could complete one high-leverage action next week, what would it be?
            </p>
            <textarea
              value={topLeverage}
              onChange={(e) => setTopLeverage(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Next week theme</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
              Choose a theme such as Business, Rental House, Health, Family, etc.
            </p>
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. Rental House"
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Notes / summary</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#ffffff",
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save weekly review (placeholder)"}
            </button>
            {saveMessage && (
              <span style={{ fontSize: 12, color: "#059669" }}>
                {saveMessage}
              </span>
            )}
          </div>
        </form>
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
        </div>
      </section>
    </DashboardLayout>
  );
}

