import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getCompletedEventsInRange,
  getLastCompletedEventsWithTasks,
  getWeeklyReviewWeeks,
  getPlannerRefinementEventsInRange,
} from "../lib/db";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sevenDayData, setSevenDayData] = useState([]);
  const [thirtyDayData, setThirtyDayData] = useState([]);
  const [hourHistogram, setHourHistogram] = useState([]);
  const [lastCompleted, setLastCompleted] = useState([]);
  const [weeklyStreak, setWeeklyStreak] = useState(0);
  const [plannerRefinementMetrics, setPlannerRefinementMetrics] = useState({
    accepted: 0,
    dismissed: 0,
    applied: 0,
  });
  const [chartsReady, setChartsReady] = useState(false);

  const chartContainerStyle = {
    width: "100%",
    minWidth: 0,
    height: 220,
  };

  useEffect(() => {
    setChartsReady(true);
  }, []);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError("");
      const today = new Date();
      const start7 = addDays(today, -7);
      const start30 = addDays(today, -30);

      try {
        const [range7, range30, last, weeks, plannerRefinements] = await Promise.all([
          getCompletedEventsInRange(user.id, dateStr(start7), dateStr(today)),
          getCompletedEventsInRange(user.id, dateStr(start30), dateStr(today)),
          getLastCompletedEventsWithTasks(user.id, 50),
          getWeeklyReviewWeeks(user.id, 52),
          getPlannerRefinementEventsInRange(user.id, dateStr(start30), dateStr(today)),
        ]);

        if (range7.error) setError(range7.error.message);
        else {
          const byDay = {};
          for (let i = 0; i <= 7; i++) {
            const d = dateStr(addDays(start7, i));
            byDay[d] = { date: d, count: 0 };
          }
          (range7.data || []).forEach((ev) => {
            const d = ev.created_at.slice(0, 10);
            if (byDay[d]) byDay[d].count += 1;
          });
          setSevenDayData(
            Object.keys(byDay)
              .sort()
              .map((d) => byDay[d])
          );
        }

        if (range30.error) setError(range30.error.message);
        else {
          const byDay = {};
          for (let i = 0; i <= 30; i++) {
            const d = dateStr(addDays(start30, i));
            byDay[d] = { date: d, count: 0 };
          }
          (range30.data || []).forEach((ev) => {
            const d = ev.created_at.slice(0, 10);
            if (byDay[d]) byDay[d].count += 1;
          });
          setThirtyDayData(
            Object.keys(byDay)
              .sort()
              .map((d) => byDay[d])
          );
        }

        const allInRange = [...(range7.data || []), ...(range30.data || [])];
        const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
        allInRange.forEach((ev) => {
          const h = new Date(ev.created_at).getUTCHours();
          byHour[h].count += 1;
        });
        setHourHistogram(byHour);

        if (last.error) setError(last.error.message);
        else setLastCompleted(last.data || []);

        if (!weeks.error && weeks.data) {
          const dates = (weeks.data || [])
            .map((w) => w.week_start)
            .filter(Boolean)
            .sort()
            .reverse();
          const seen = new Set(dates);
          let streak = 0;
          const todayStrVal = dateStr(today);
          const todayDate = new Date(todayStrVal);
          for (let i = 0; i < 104; i++) {
            const d = new Date(todayDate);
            d.setUTCDate(d.getUTCDate() - i * 7);
            const weekStartIso = d.toISOString().slice(0, 10);
            if (seen.has(weekStartIso)) streak += 1;
            else break;
          }
          setWeeklyStreak(streak);
        }

        if (plannerRefinements.error) setError(plannerRefinements.error.message);
        else {
          const events = plannerRefinements.data || [];
          const metrics = { accepted: 0, dismissed: 0, applied: 0 };
          events.forEach((ev) => {
            if (ev.event_type !== "updated" || ev.value?.source !== "planner_refinement") return;
            const action = ev.value?.action;
            if (action === "accept") metrics.accepted += 1;
            if (action === "dismiss") metrics.dismissed += 1;
            if (action === "applied") metrics.applied += 1;
          });
          setPlannerRefinementMetrics(metrics);
        }
      } catch (e) {
        setError(e.message || "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

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
          Analytics
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Completion momentum, time-of-day, weekly reviews, and recent activity.
        </p>
        {weeklyStreak > 0 && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "#059669",
            }}
          >
            Weekly review streak: {weeklyStreak} week{weeklyStreak === 1 ? "" : "s"}.
          </p>
        )}

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
            Planner refinement analytics (last 30 days)
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#ecfdf5", color: "#065f46", fontSize: 13 }}>
              Accepted: <strong>{plannerRefinementMetrics.accepted}</strong>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#eff6ff", color: "#1d4ed8", fontSize: 13 }}>
              Applied: <strong>{plannerRefinementMetrics.applied}</strong>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "#f9fafb", color: "#374151", fontSize: 13 }}>
              Dismissed: <strong>{plannerRefinementMetrics.dismissed}</strong>
            </div>
          </div>
        </section>

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
            7-day momentum (tasks completed per day)
          </h2>
          <div style={chartContainerStyle}>
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={180}>
                <BarChart data={sevenDayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#111827" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
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
            30-day momentum
          </h2>
          <div style={chartContainerStyle}>
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={180}>
                <BarChart data={thirtyDayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#374151" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
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
            Completion time of day (UTC hour)
          </h2>
          <div style={chartContainerStyle}>
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={180}>
                <BarChart data={hourHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
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
            Completed tasks with timestamps (last 50)
          </h2>
          {lastCompleted.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              No completed events yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 8px 6px" }}>Task</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 6px" }}>Completed at</th>
                  </tr>
                </thead>
                <tbody>
                  {lastCompleted.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px" }}>
                        {ev.task?.title ?? ev.task_id}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#6b7280" }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
