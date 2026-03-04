import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DashboardLayout from "../components/DashboardLayout";
import {
  getBodyWeightLogs,
  insertBodyWeightLog,
  getLiftingSessions,
  createLiftingSession,
  getLiftingSets,
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
} from "recharts";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function HealthPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [weightLogs, setWeightLogs] = useState([]);
  const [weightDate, setWeightDate] = useState(todayStr());
  const [weightKg, setWeightKg] = useState("");
  const [sessions, setSessions] = useState([]);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [setsBySession, setSetsBySession] = useState({});
  const [newSessionDate, setNewSessionDate] = useState(todayStr());
  const [newSetExercise, setNewSetExercise] = useState("");
  const [newSetWeight, setNewSetWeight] = useState("");
  const [newSetReps, setNewSetReps] = useState("");
  const [newSetNumber, setNewSetNumber] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      if (!u) window.location.href = "/login";
      setUser(u);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      if (!u) window.location.href = "/login";
      setUser(u);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [wRes, sRes] = await Promise.all([
        getBodyWeightLogs(user.id),
        getLiftingSessions(user.id),
      ]);
      if (wRes.error) setError(wRes.error.message);
      else setWeightLogs(wRes.data || []);
      if (sRes.error) setError(sRes.error.message);
      else setSessions(sRes.data || []);
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
    const res = await insertBodyWeightLog(user.id, weightDate, parseFloat(weightKg));
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
    const res = await addLiftingSet(sessionId, {
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
    .map((r) => ({ date: r.log_date, weight: r.weight_kg }));

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
              placeholder="kg"
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
                  <Line type="monotone" dataKey="weight" stroke="#111827" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
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
                              <td style={{ padding: "4px 8px" }}>{set.exercise_name}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px" }}>{set.weight_kg ?? "—"}</td>
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
