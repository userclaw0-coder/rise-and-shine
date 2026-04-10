import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { loadCollaborativeProjects, loadWorkspaceOrders } from "../lib/collaborationClient";

function ProjectTile({ category, taskStats, mantra, nextAction }) {
  const href = `/category/${category.id}`;
  const { total, done, overdue, doing } = taskStats;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  // Status: complete, active (has doing tasks), stale (overdue), idle
  const status = allDone ? "complete" : overdue > 0 ? "attention" : doing > 0 ? "active" : "idle";
  const statusColors = {
    complete: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", dot: "#22c55e" },
    active: { bg: "rgba(184, 134, 11, 0.06)", border: "rgba(184, 134, 11, 0.2)", dot: "#b8860b" },
    attention: { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.2)", dot: "#ef4444" },
    idle: { bg: "var(--rs-card-bg, #faf9f6)", border: "var(--rs-border, #e5e1d8)", dot: "#d1d5db" },
  };
  const sc = statusColors[status];

  return (
    <Link
      href={href}
      className="rs-project-tile"
      style={{ background: sc.bg, borderColor: sc.border }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
        <h2 className="rs-project-tile__title" style={{ margin: 0 }}>{category.name}</h2>
      </div>

      {mantra && (
        <p style={{ fontSize: 12, color: "var(--rs-text-muted, #8a8478)", margin: "0 0 8px", lineHeight: 1.4, fontStyle: "italic" }}>
          {mantra}
        </p>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--rs-text-muted, #8a8478)", marginBottom: 3 }}>
          <span>{done} of {total} tasks done</span>
          <span>{pct}%</span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: "var(--rs-border, #e5e1d8)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 2,
              background: allDone ? "#22c55e" : "var(--rs-accent, #b8860b)",
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Next action */}
      {nextAction && !allDone && (
        <div style={{ fontSize: 12, color: "var(--rs-text, #3e3a33)", display: "flex", alignItems: "flex-start", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, marginTop: 1, color: "var(--rs-accent, #b8860b)" }}>
            arrow_forward
          </span>
          <span style={{ lineHeight: 1.3 }}>{nextAction}</span>
        </div>
      )}

      {allDone && total > 0 && (
        <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
          All tasks complete
        </div>
      )}

      {overdue > 0 && (
        <div style={{ fontSize: 11, color: "var(--rs-danger, #c0392b)", marginTop: 4, fontWeight: 500 }}>
          {overdue} overdue
        </div>
      )}
    </Link>
  );
}

export default function ProjectsPage() {
  const { user, isCheckingAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [filterQ, setFilterQ] = useState("");
  const [workspaceOrders, setWorkspaceOrders] = useState({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [data, ordersData] = await Promise.all([
        loadCollaborativeProjects(),
        loadWorkspaceOrders().catch(() => ({ orders: {} })),
      ]);
      setCategories(data.categories || []);
      setTasks(data.tasks || []);
      setProfile(data.profile || null);
      setWorkspaceOrders(ordersData.orders || {});
    } catch (e) {
      setError(e.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const tiles = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const categoryOrderIds = profile?.preferences?.category_order_ids || [];

    const filtered = (categories || [])
      .filter((c) => !q || String(c.name || "").toLowerCase().includes(q))
      .map((cat) => {
        const tasksInCat = (tasks || []).filter((t) => String(t.category_id) === String(cat.id));
        const roots = tasksInCat.filter((t) => !t.parent_task_id);
        const total = roots.length;
        const done = roots.filter((t) => t.status === "done" || t.status === "archived").length;
        const doing = roots.filter((t) => t.status === "doing").length;
        const overdue = roots.filter(
          (t) => t.due_date && t.due_date < today && t.status !== "done" && t.status !== "archived"
        ).length;

        // Find next action: use task_order_ids if set, else fall back to priority
        const taskOrderIds = workspaceOrders[cat.id]?.task_order_ids || [];
        const eligible = roots.filter((t) => {
          if (t.status === "done" || t.status === "archived") return false;
          const tags = Array.isArray(t.tags)
            ? t.tags.map((tg) => (typeof tg === "string" ? tg : tg?.tag?.name || tg?.name)).filter(Boolean)
            : [];
          return !tags.some((tag) => tag.toLowerCase() === "blocked" || tag.toLowerCase() === "waiting" || tag.toLowerCase().startsWith("blocked-by:"));
        });

        let nextAction = null;
        if (taskOrderIds.length > 0) {
          const eligibleIds = new Set(eligible.map((t) => t.id));
          const firstOrdered = taskOrderIds.find((id) => eligibleIds.has(id));
          if (firstOrdered) {
            nextAction = eligible.find((t) => t.id === firstOrdered)?.title || null;
          }
        }
        if (!nextAction && eligible.length > 0) {
          const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
          eligible.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
          nextAction = eligible[0]?.title || null;
        }

        // Get mantra from workspace preferences
        const ws = profile?.preferences?.project_workspaces?.[cat.id];
        const mantra = ws?.mantra || "";

        return {
          category: cat,
          taskStats: { total, done, doing, overdue },
          nextAction,
          mantra,
        };
      });

    // Sort by category_order_ids from backlog page (user's manual project priority)
    if (categoryOrderIds.length > 0) {
      const orderMap = new Map(categoryOrderIds.map((id, i) => [id, i]));
      filtered.sort((a, b) => {
        const aComplete = a.taskStats.total > 0 && a.taskStats.done === a.taskStats.total;
        const bComplete = b.taskStats.total > 0 && b.taskStats.done === b.taskStats.total;
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        const aIdx = orderMap.has(a.category.id) ? orderMap.get(a.category.id) : 999;
        const bIdx = orderMap.has(b.category.id) ? orderMap.get(b.category.id) : 999;
        return aIdx - bIdx;
      });
    } else {
      filtered.sort((a, b) => {
        const aComplete = a.taskStats.total > 0 && a.taskStats.done === a.taskStats.total;
        const bComplete = b.taskStats.total > 0 && b.taskStats.done === b.taskStats.total;
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        return String(a.category.name).localeCompare(String(b.category.name));
      });
    }

    return filtered;
  }, [categories, tasks, profile, filterQ, workspaceOrders]);

  if (isCheckingAuth || (!user && !loading)) {
    return (
      <DashboardLayout>
        <p className="rs-page-muted">Sign in to view projects.</p>
      </DashboardLayout>
    );
  }

  if (!user || loading) {
    return (
      <DashboardLayout>
        <p className="rs-page-muted">Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        subtitle="Your active projects, ordered by priority. Each tile opens the full project workspace."
        right={
          <div className="rs-projects-filter">
            <span className="material-symbols-outlined" aria-hidden>
              filter_list
            </span>
            <input
              type="search"
              className="rs-projects-filter__input"
              placeholder="Filter projects…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              aria-label="Filter projects by name"
            />
          </div>
        }
      />

      {error && (
        <p style={{ color: "var(--rs-error)", fontSize: 14, marginBottom: 12 }}>{error}</p>
      )}

      {categories.length === 0 ? (
        <div className="rs-projects-empty">
          <p className="rs-projects-empty__title">No project categories yet</p>
          <p className="rs-projects-empty__text">
            Add a category on <Link href="/backlog#rs-backlog-add-category">Action Items</Link>, then return here to
            see workspace tiles.
          </p>
        </div>
      ) : tiles.length === 0 ? (
        <p className="rs-page-muted">No projects match your filter.</p>
      ) : (
        <div className="rs-projects-grid">
          {tiles.map(({ category, taskStats, nextAction, mantra }) => (
            <ProjectTile
              key={category.id}
              category={category}
              taskStats={taskStats}
              nextAction={nextAction}
              mantra={mantra}
            />
          ))}
          <Link href="/backlog#rs-backlog-add-category" className="rs-project-tile rs-project-tile--new">
            <span className="material-symbols-outlined rs-project-tile--new__icon" aria-hidden>
              add
            </span>
            <span className="rs-project-tile--new__label">New project</span>
            <span className="rs-project-tile--new__hint">Add a category on Action Items</span>
          </Link>
        </div>
      )}

      <Link href="/vision" className="rs-projects-fab" title="Open vision board" aria-label="Open vision board">
        <span className="material-symbols-outlined" aria-hidden>
          auto_awesome
        </span>
      </Link>
    </DashboardLayout>
  );
}
