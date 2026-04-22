import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

const COLORS = [
  "var(--ps-clay)",
  "var(--ps-indigo)",
  "var(--ps-plum)",
  "var(--ps-accent)",
  "var(--ps-gold)",
  "var(--ps-sage)",
  "var(--ps-ink)",
];

function daysSince(iso) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [workspaces, setWorkspaces] = useState({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, taskRes, wsRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("tasks")
          .select("id, category_id, status, priority, updated_at, effort_hours, due_date, title")
          .eq("user_id", user.id)
          .is("archived_at", null),
        supabase
          .from("shared_project_workspaces")
          .select("category_id, workspace")
          .eq("owner_user_id", user.id),
      ]);
      if (catRes.error) throw new Error(catRes.error.message);
      if (taskRes.error) throw new Error(taskRes.error.message);
      setCategories(catRes.data || []);
      setTasks(taskRes.data || []);
      const wsMap = {};
      for (const row of wsRes?.data || []) {
        wsMap[row.category_id] = row.workspace || {};
      }
      setWorkspaces(wsMap);
    } catch (err) {
      setError(err.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const tiles = useMemo(() => {
    const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return categories.map((c, i) => {
      const catTasks = tasks.filter((t) => t.category_id === c.id);
      const open = catTasks.filter((t) => t.status !== "done").length;
      const done = catTasks.filter((t) => t.status === "done").length;
      const overdue = catTasks.filter(
        (t) =>
          t.status !== "done" &&
          t.due_date &&
          new Date(t.due_date + "T00:00:00") <
            new Date(new Date().toDateString())
      ).length;
      const next = catTasks
        .filter((t) => t.status !== "done")
        .sort((a, b) => {
          const ap = priorityOrder[a.priority] ?? 2;
          const bp = priorityOrder[b.priority] ?? 2;
          if (ap !== bp) return ap - bp;
          return (a.due_date || "9999").localeCompare(b.due_date || "9999");
        })[0];
      const lastTouch = catTasks.reduce(
        (a, t) => (t.updated_at && t.updated_at > a ? t.updated_at : a),
        ""
      );
      const progress = open + done > 0 ? done / (open + done) : 0;
      const ws = workspaces[c.id] || {};
      const lastAligned = ws.last_aligned_at
        ? Math.round((Date.now() - new Date(ws.last_aligned_at).getTime()) / 86400000)
        : null;
      const stale = lastAligned == null || lastAligned > 30;
      return {
        id: c.id,
        name: c.name,
        color: COLORS[i % COLORS.length],
        open,
        done,
        overdue,
        next: next?.title || ws.next_action?.title || null,
        lastTouchDays: lastTouch ? daysSince(lastTouch) : null,
        progress,
        lastAlignedDays: lastAligned,
        stale,
      };
    });
  }, [categories, tasks, workspaces]);

  const coachPayload = {
    total_projects: tiles.length,
    projects: tiles.slice(0, 14).map((t) => ({
      name: t.name,
      open: t.open,
      overdue: t.overdue,
      last_touch_days: t.lastTouchDays,
      next: t.next,
    })),
    stale_projects: tiles
      .filter((t) => t.lastTouchDays != null && t.lastTouchDays > 7)
      .map((t) => t.name),
  };

  return (
    <PSShell scope="projects" title="Projects" coachPayload={coachPayload} coachPayloadReady={!loading}>
      <div className="ps-view">
        <div className="ps-eyebrow">05 · Projects</div>
        <h1 className="ps-title">Your portfolio.</h1>
        <p className="ps-sub">
          Each project carries outcomes, a task ladder, and a coach that knows
          it. Open one to work on it.
        </p>

        {error && <div className="today-error">{error}</div>}

        {loading ? (
          <div className="pj-list-empty">Loading projects…</div>
        ) : tiles.length === 0 ? (
          <div className="pj-list-empty">
            No projects yet. Create one in{" "}
            <Link href="/backlog">Action items</Link>.
          </div>
        ) : (
          <div className="pj-list-grid">
            {tiles.map((t) => (
              <Link key={t.id} href={`/category/${t.id}`} className="pj-tile">
                <div className="pj-tile-head">
                  <span
                    className="pj-tile-dot"
                    style={{ background: t.color }}
                  />
                  <div className="pj-tile-name">{t.name}</div>
                  {t.stale && (
                    <span className="pj-tile-stale" title="Last aligned > 30 days ago — run Refresh">
                      Needs refresh
                    </span>
                  )}
                </div>
                {t.next && (
                  <div className="pj-tile-next">
                    <span className="pj-tile-cap">Next</span>
                    <span className="pj-tile-next-text">{t.next}</span>
                  </div>
                )}
                <div className="pj-tile-meta">
                  <span>
                    <strong>{t.open}</strong> open
                  </span>
                  <span>
                    <strong>{t.done}</strong> done
                  </span>
                  {t.overdue > 0 && (
                    <span className="pj-tile-overdue">
                      <strong>{t.overdue}</strong> overdue
                    </span>
                  )}
                  {t.lastTouchDays != null && (
                    <span className="pj-tile-touched">
                      {t.lastTouchDays === 0
                        ? "Today"
                        : t.lastTouchDays === 1
                        ? "1d ago"
                        : `${t.lastTouchDays}d ago`}
                    </span>
                  )}
                </div>
                <div className="pj-tile-bar">
                  <div
                    className="pj-tile-bar-fill"
                    style={{
                      width: Math.round(t.progress * 100) + "%",
                      background: t.color,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        .pj-list-empty {
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          border-radius: 12px;
          padding: 40px 24px;
          text-align: center;
          color: var(--ps-ink-60);
          font-size: 13px;
          margin-top: 18px;
        }
        .pj-list-empty a { color: var(--ps-accent); }
        .pj-list-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
          margin-top: 20px;
        }
        .pj-tile {
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 16px 18px;
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .pj-tile:hover {
          border-color: var(--ps-ink-30);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
        }
        .pj-tile-head {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pj-tile-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .pj-tile-name {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
        }
        .pj-tile-next {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 10px;
          background: #fff;
          border-radius: 8px;
          border: 1px dashed var(--ps-ink-10);
        }
        .pj-tile-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .pj-tile-next-text {
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.4;
        }
        .pj-tile-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--ps-ink-60);
          margin-top: 2px;
        }
        .pj-tile-meta strong {
          color: var(--ps-ink);
          font-weight: 600;
        }
        .pj-tile-stale {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-clay);
          background: var(--ps-clay-soft);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .pj-tile-overdue {
          color: var(--ps-clay);
        }
        .pj-tile-overdue strong {
          color: var(--ps-clay);
        }
        .pj-tile-touched {
          margin-left: auto;
        }
        .pj-tile-bar {
          height: 4px;
          background: var(--ps-ink-08);
          border-radius: 2px;
          overflow: hidden;
        }
        .pj-tile-bar-fill {
          height: 100%;
          transition: width 300ms;
        }
      `}</style>
    </PSShell>
  );
}
