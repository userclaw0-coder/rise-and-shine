import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getBodyWeightLogs,
  insertBodyWeightLog,
  getLiftingSessions,
  createLiftingSession,
  getLiftingSets,
  getLiftingSetsWithSession,
  addLiftingSet,
} from "../lib/db";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function HealthPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [weightLogs, setWeightLogs] = useState([]);
  const [weightDate, setWeightDate] = useState(todayStr());
  const [weightKg, setWeightKg] = useState("");
  const [sessions, setSessions] = useState([]);
  const [setsWithSession, setSetsWithSession] = useState([]);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [setsBySession, setSetsBySession] = useState({});
  const [newSessionDate, setNewSessionDate] = useState(todayStr());
  const [newSetExercise, setNewSetExercise] = useState("");
  const [newSetWeight, setNewSetWeight] = useState("");
  const [newSetReps, setNewSetReps] = useState("");
  const [newSetNumber, setNewSetNumber] = useState("");

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load runs once when user is set
  }, [user]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [wRes, sRes, setsRes] = await Promise.all([
        getBodyWeightLogs(user.id),
        getLiftingSessions(user.id),
        getLiftingSetsWithSession(user.id),
      ]);
      if (wRes.error) setError(wRes.error.message);
      else setWeightLogs(wRes.data || []);
      if (sRes.error) setError(sRes.error.message);
      else setSessions(sRes.data || []);
      if (!setsRes.error) setSetsWithSession(setsRes.data || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadSets(sessionId) {
    const res = await getLiftingSets(sessionId);
    if (!res.error) setSetsBySession((prev) => ({ ...prev, [sessionId]: res.data || [] }));
  }

  useEffect(() => {
    if (!expandedSessionId) return;
    loadSets(expandedSessionId);
  }, [expandedSessionId]);

  async function handleAddWeight() {
    if (!user || !weightKg.trim()) return;
    setError("");
    const res = await insertBodyWeightLog(user.id, weightDate, parseFloat(weightKg), "lb");
    if (res.error) setError(res.error.message);
    else {
      setWeightLogs((prev) => [res.data, ...prev]);
      setWeightKg("");
      setWeightDate(todayStr());
    }
  }

  async function handleCreateSession() {
    if (!user) return;
    setError("");
    const res = await createLiftingSession(user.id, newSessionDate);
    if (res.error) setError(res.error.message);
    else {
      setSessions((prev) => [res.data, ...prev]);
      setNewSessionDate(todayStr());
    }
  }

  async function handleAddSet(sessionId) {
    if (!newSetExercise.trim()) return;
    setError("");
    const res = await addLiftingSet(user.id, sessionId, {
      exercise_name: newSetExercise.trim(),
      weight_kg: newSetWeight ? parseFloat(newSetWeight) : null,
      reps: newSetReps ? parseInt(newSetReps, 10) : null,
      set_number: newSetNumber ? parseInt(newSetNumber, 10) : null,
    });
    if (res.error) setError(res.error.message);
    else {
      loadSets(sessionId);
      setNewSetExercise("");
      setNewSetWeight("");
      setNewSetReps("");
      setNewSetNumber("");
    }
  }

  const weightChartData = [...(weightLogs || [])]
    .reverse()
    .map((r) => ({ date: (r.measured_at || "").slice(0, 10), weight: r.weight }));

  // Build exercise progress: max weight per exercise per session date (for Occam's exercise plots)
  const exerciseChartData = (() => {
    const rows = setsWithSession || [];
    const byDate = new Map(); // date -> { date, "Exercise Name": maxWeight, ... }
    const exerciseColors = [
      "#111827", "#059669", "#2563eb", "#dc2626", "#7c3aed",
      "#ea580c", "#0d9488", "#4f46e5",
    ];
    for (const row of rows) {
      const session = row.session;
      const sessionDate = session?.session_date ?? (Array.isArray(session) ? session[0]?.session_date : null);
      if (!sessionDate) continue;
      const exercise = (row.exercise || "").trim() || "Unknown";
      const w = row.weight != null ? Number(row.weight) : null;
      if (w == null) continue;
      let entry = byDate.get(sessionDate);
      if (!entry) {
        entry = { date: sessionDate };
        byDate.set(sessionDate, entry);
      }
      const prev = entry[exercise];
      entry[exercise] = prev == null ? w : Math.max(prev, w);
    }
    const dates = [...byDate.keys()].sort();
    const data = dates.map((d) => byDate.get(d));
    const exerciseNames = [...new Set(data.flatMap((d) => Object.keys(d).filter((k) => k !== "date")))]
      .filter(Boolean)
      .sort();
    return { data, exerciseNames, exerciseColors };
  })();

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
          Health
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Body weight and lifting sessions.
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
            Body weight
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="date"
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
            />
            <input
              type="number"
              step="0.1"
              placeholder="lb"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              style={{ padding: "6px 8px", width: 80, borderRadius: 6, border: "1px solid #e5e7eb" }}
            />
            <button
              onClick={handleAddWeight}
              disabled={!weightKg.trim()}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                fontSize: 13,
                cursor: weightKg.trim() ? "pointer" : "not-allowed",
              }}
            >
              Log
            </button>
          </div>
          {weightChartData.length > 0 && (
            <div style={{ height: 220, marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#111827" strokeWidth={2} dot={{ r: 3 }} name="Weight (lb)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {exerciseChartData.data.length > 0 && exerciseChartData.exerciseNames.length > 0 && (
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
              Exercise progress (max weight per session)
            </h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
              Weight over time by exercise. One line per exercise.
            </p>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={exerciseChartData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {exerciseChartData.exerciseNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={exerciseChartData.exerciseColors[i % exerciseChartData.exerciseColors.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

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
            Lifting sessions
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <input
              type="date"
              value={newSessionDate}
              onChange={(e) => setNewSessionDate(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
            />
            <button
              onClick={handleCreateSession}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              New session
            </button>
          </div>
          {sessions.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>No sessions yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {sessions.map((s) => (
                <li
                  key={s.id}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    padding: "8px 0",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSessionId((id) => (id === s.id ? null : s.id))
                    }
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 6,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {s.session_date} {expandedSessionId === s.id ? "▼" : "▶"}
                  </button>
                  {expandedSessionId === s.id && (
                    <div style={{ paddingLeft: 12, marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        <input
                          type="text"
                          placeholder="Exercise"
                          value={newSetExercise}
                          onChange={(e) => setNewSetExercise(e.target.value)}
                          style={{ padding: "4px 6px", width: 120, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}
                        />
                        <input
                          type="number"
                          step="0.5"
                          placeholder="kg"
                          value={newSetWeight}
                          onChange={(e) => setNewSetWeight(e.target.value)}
                          style={{ padding: "4px 6px", width: 56, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}
                        />
                        <input
                          type="number"
                          placeholder="reps"
                          value={newSetReps}
                          onChange={(e) => setNewSetReps(e.target.value)}
                          style={{ padding: "4px 6px", width: 56, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}
                        />
                        <input
                          type="number"
                          placeholder="#"
                          value={newSetNumber}
                          onChange={(e) => setNewSetNumber(e.target.value)}
                          style={{ padding: "4px 6px", width: 40, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddSet(s.id)}
                          disabled={!newSetExercise.trim()}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid #059669",
                            background: "#ecfdf5",
                            color: "#059669",
                            fontSize: 12,
                            cursor: newSetExercise.trim() ? "pointer" : "not-allowed",
                          }}
                        >
                          Add set
                        </button>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "#6b7280" }}>
                            <th style={{ textAlign: "left", padding: "4px 8px" }}>Exercise</th>
                            <th style={{ textAlign: "right", padding: "4px 8px" }}>kg</th>
                            <th style={{ textAlign: "right", padding: "4px 8px" }}>Reps</th>
                            <th style={{ textAlign: "right", padding: "4px 8px" }}>Set</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(setsBySession[s.id] || []).map((set) => (
                            <tr key={set.id}>
                              <td style={{ padding: "4px 8px" }}>{set.exercise}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px" }}>{set.weight ?? "—"}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px" }}>{set.reps ?? "—"}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px" }}>{set.set_number ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
