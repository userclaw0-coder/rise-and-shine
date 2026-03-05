import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";

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
  const [savedJson, setSavedJson] = useState(null);

  const { start, end } = useMemo(() => getWeekRange(new Date()), []);

  useEffect(() => {
    if (savedJson) {
      // eslint-disable-next-line no-console
      console.log("Weekly review payload (placeholder submit):", savedJson);
    }
  }, [savedJson]);

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
    const payload = {
      week_summary: notes || "",
      week_start: start,
      week_end: end,
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
      promote_tasks: [],
      automation_suggestions: [],
    };
    setSavedJson(payload);
    setSaving(false);
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

      <section
        style={{
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                marginBottom: 8,
              }}
            >
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
            {savedJson && (
              <span style={{ fontSize: 12, color: "#059669" }}>
                Captured. Check console for payload.
              </span>
            )}
          </div>
        </form>
      </section>
    </DashboardLayout>
  );
}

