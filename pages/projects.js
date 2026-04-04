import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { loadCollaborativeProjects } from "../lib/collaborationClient";
import { computeProjectTileMetrics } from "../lib/projectDashboardMetrics";
import {
  isTaskNeedingAlignment,
  isTaskNeedingSubtasks,
  isStaleDoingTask,
} from "../lib/weeklyImprovementContext";

function ProjectTile({ category, metrics, featured, badges }) {
  const href = `/category/${category.id}`;
  const cls = `rs-project-tile${featured ? " rs-project-tile--featured" : ""}`;
  const memberPreview = Array.isArray(category._memberPreview) ? category._memberPreview : [];
  const roleLabel = category?._access?.role || "viewer";

  return (
    <Link href={href} className={cls}>
      <div className="rs-project-tile__top">
        <span className="material-symbols-outlined rs-project-tile__pulse" aria-hidden>
          {metrics.totalRootCount > 0 ? "bolt" : "nest_clock_farsight_analog"}
        </span>
        <span className="rs-project-tile__activity">{metrics.activityLabel}</span>
      </div>

      <div className={featured ? "rs-project-tile__featured-body" : undefined}>
        <div className="rs-project-tile__main">
          <h2 className="rs-project-tile__title">{category.name}</h2>
          <div className="rs-project-tile__members">
            <span>{category._memberCount || 1} collaborator{category._memberCount === 1 ? "" : "s"}</span>
            <span aria-hidden>·</span>
            <span>{roleLabel}</span>
            {memberPreview.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{memberPreview.map((member) => member.email || "member").join(", ")}</span>
              </>
            )}
          </div>
          <div className="rs-project-tile__insight">
            <span className="rs-project-tile__insight-label">AI insight</span>
            <p className="rs-project-tile__insight-text">{metrics.insight}</p>
          </div>
          {badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {badges.map((badge) => (
                <span
                  key={badge.label}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: "rgba(240, 215, 140, 0.28)",
                    border: "1px solid rgba(212, 175, 55, 0.38)",
                    color: "var(--rs-primary-strong)",
                  }}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {!featured && (
            <div className="rs-project-tile__health-block">
              <div className="rs-project-tile__health-row">
                <span>Health score</span>
                <span className="rs-project-tile__health-pct">{metrics.health}%</span>
              </div>
              <div
                className="rs-project-tile__bar"
                role="progressbar"
                aria-valuenow={metrics.health}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="rs-project-tile__bar-fill" style={{ width: `${metrics.health}%` }} />
              </div>
            </div>
          )}
        </div>

        {featured && (
          <div className="rs-project-tile__momentum" aria-hidden>
            <div
              className="rs-project-tile__momentum-ring"
              style={{ "--p": metrics.health }}
            >
              <div className="rs-project-tile__momentum-inner">
                <span className="rs-project-tile__momentum-val">{metrics.health}%</span>
                <span className="rs-project-tile__momentum-lbl">Momentum</span>
              </div>
            </div>
          </div>
        )}
      </div>
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

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const data = await loadCollaborativeProjects();
      setCategories(data.categories || []);
      setTasks(data.tasks || []);
      setProfile(data.profile || null);
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
    return (categories || [])
      .filter((c) => !q || String(c.name || "").toLowerCase().includes(q))
      .map((cat) => {
        const tasksInCat = (tasks || []).filter((t) => String(t.category_id) === String(cat.id));
        const metrics = computeProjectTileMetrics(tasksInCat, profile);
        const roots = tasksInCat.filter((t) => !t.parent_task_id);
        const badges = [];
        const unalignedCount = roots.filter(isTaskNeedingAlignment).length;
        const splitCount = roots.filter(isTaskNeedingSubtasks).length;
        const staleDoingCount = roots.filter(isStaleDoingTask).length;
        if (unalignedCount > 0) badges.push({ label: `${unalignedCount} need alignment` });
        if (splitCount > 0) badges.push({ label: `${splitCount} need split` });
        if (staleDoingCount > 0) badges.push({ label: `${staleDoingCount} stale doing` });
        return { category: cat, metrics, badges: badges.slice(0, 3) };
      })
      .sort((a, b) => String(a.category.name).localeCompare(String(b.category.name)));
  }, [categories, tasks, profile, filterQ]);

  const featuredId = useMemo(() => {
    if (tiles.length === 0) return null;
    let bestId = tiles[0].category.id;
    let best = -1;
    for (const t of tiles) {
      if (t.metrics.featuredScore > best) {
        best = t.metrics.featuredScore;
        bestId = t.category.id;
      }
    }
    return bestId;
  }, [tiles]);

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
        eyebrow="Vision · strategic workspaces"
        title="Project strategic initiatives"
        subtitle="A curated overview of your active ecosystems, growth cycles, and long-term legacy assets. Each tile opens that project’s full workspace."
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
          {tiles.map(({ category, metrics, badges }) => (
            <ProjectTile
              key={category.id}
              category={category}
              metrics={metrics}
              badges={badges}
              featured={String(category.id) === String(featuredId)}
            />
          ))}
          <Link href="/backlog#rs-backlog-add-category" className="rs-project-tile rs-project-tile--new">
            <span className="material-symbols-outlined rs-project-tile--new__icon" aria-hidden>
              add
            </span>
            <span className="rs-project-tile--new__label">Initiate new strategy</span>
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
