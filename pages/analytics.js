import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DashboardLayout from "../components/DashboardLayout";
import {
  getCompletedEventsInRange,
  getLastCompletedEventsWithTasks,
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sevenDayData, setSevenDayData] = useState([]);
  const [thirtyDayData, setThirtyDayData] = useState([]);
  const [hourHistogram, setHourHistogram] = useState([]);
  const [lastCompleted, setLastCompleted] = useState([]);

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

    async function load() {
      setLoading(true);
      setError("");
      const today = new Date();
      const start7 = addDays(today, -7);
      const start30 = addDays(today, -30);

      try {
        const [range7, range30, last] = await Promise.all([
          getCompletedEventsInRange(user.id, dateStr(start7), dateStr(today)),
          getCompletedEventsInRange(user.id, dateStr(start30), dateStr(today)),
          getLastCompletedEventsWithTasks(user.id, 50),
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
      } catch (e) {
        setError(e.message || "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

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
          Analytics
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Completion momentum, time-of-day, and recent activity.
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
            7-day momentum (tasks completed per day)
          </h2>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sevenDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#111827" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={thirtyDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#374151" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
