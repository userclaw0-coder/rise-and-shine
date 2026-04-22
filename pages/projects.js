import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import { getUserProfile, upsertUserProfile } from "../lib/db";

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
  const [profile, setProfile] = useState(null);
  const [order, setOrder] = useState([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, taskRes, wsRes, profileRes] = await Promise.all([
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
        getUserProfile(user.id),
      ]);
      if (catRes.error) throw new Error(catRes.error.message);
      if (taskRes.error) throw new Error(taskRes.error.message);
      const cats = catRes.data || [];
      setCategories(cats);
      setTasks(taskRes.data || []);
      const wsMap = {};
      for (const row of wsRes?.data || []) {
        wsMap[row.category_id] = row.workspace || {};
      }
      setWorkspaces(wsMap);
      setProfile(profileRes?.data || null);

      const prefs = profileRes?.data?.profile?.preferences || {};
      const savedOrder = Array.isArray(prefs.category_order_ids)
        ? prefs.category_order_ids.filter((id) => cats.some((c) => c.id === id))
        : [];
      const newcomers = cats.map((c) => c.id).filter((id) => !savedOrder.includes(id));
      setOrder([...savedOrder, ...newcomers]);
    } catch (err) {
      setError(err.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const persistOrder = useCallback(
    async (nextOrder) => {
      if (!user) return;
      setSavingOrder(true);
      try {
        const base = profile?.profile || {};
        const prefs = base.preferences || {};
        const nextProfile = {
          ...base,
          preferences: { ...prefs, category_order_ids: nextOrder },
        };
        const res = await upsertUserProfile(user.id, nextProfile);
        if (res?.data) setProfile(res.data);
      } catch (err) {
        setError(err.message || "Failed to save order.");
      } finally {
        setSavingOrder(false);
      }
    },
    [user, profile]
  );

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const prev = order;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    persistOrder(next).catch(() => setOrder(prev));
  }

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const tiles = useMemo(() => {
    const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return order
      .map((id, i) => {
        const c = catById.get(id);
        if (!c) return null;
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
          rank: i + 1,
        };
      })
      .filter(Boolean);
  }, [order, catById, tasks, workspaces]);

  const coachPayload = {
    total_projects: tiles.length,
    ordered_top5: tiles.slice(0, 5).map((t) => t.name),
    projects: tiles.slice(0, 14).map((t) => ({
      rank: t.rank,
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
          Drag to reorder — top = highest priority. The refill scorer weights
          tasks higher in ranked-top projects. Click a tile to open it.
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
          <>
            <div className="pj-order-hint">
              {savingOrder ? "Saving order…" : "Top of list = highest priority"}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={order}
                strategy={verticalListSortingStrategy}
              >
                <div className="pj-rank-list">
                  {tiles.map((t) => (
                    <SortableProjectRow key={t.id} t={t} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
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
        .pj-order-hint {
          margin-top: 16px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .pj-rank-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .pj-rank-row {
          display: grid;
          grid-template-columns: 56px 1fr;
          gap: 10px;
          align-items: stretch;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          transition: border-color 120ms, box-shadow 120ms, transform 60ms;
        }
        .pj-rank-row:hover { border-color: var(--ps-ink-30); }
        .pj-rank-row--dragging {
          border-color: var(--ps-accent);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          z-index: 2;
        }
        .pj-rank-handle {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 12px 0;
          border-right: 1px solid var(--ps-ink-08);
          color: var(--ps-ink-50);
          cursor: grab;
          user-select: none;
          touch-action: none;
        }
        .pj-rank-handle:active { cursor: grabbing; }
        .pj-rank-num {
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--ps-ink);
        }
        .pj-rank-grip {
          font-family: var(--ps-mono);
          font-size: 14px;
          line-height: 1;
          color: var(--ps-ink-30);
          letter-spacing: -0.1em;
        }
        .pj-tile {
          background: transparent;
          border: none;
          border-radius: 12px;
          padding: 16px 18px 14px;
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
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
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
        .pj-tile-overdue { color: var(--ps-clay); }
        .pj-tile-overdue strong { color: var(--ps-clay); }
        .pj-tile-touched { margin-left: auto; }
        .pj-tile-bar {
          height: 4px;
          background: var(--ps-ink-08);
          border-radius: 2px;
          overflow: hidden;
        }
        .pj-tile-bar-fill { height: 100%; transition: width 300ms; }
      `}</style>
    </PSShell>
  );
}

function SortableProjectRow({ t }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: t.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={"pj-rank-row" + (isDragging ? " pj-rank-row--dragging" : "")}
    >
      <div
        className="pj-rank-handle"
        {...attributes}
        {...listeners}
        title="Drag to reorder priority"
        aria-label={`Drag to reorder ${t.name}`}
      >
        <span className="pj-rank-num">{String(t.rank).padStart(2, "0")}</span>
        <span className="pj-rank-grip">⋮⋮</span>
      </div>
      <Link href={`/category/${t.id}`} className="pj-tile">
        <div className="pj-tile-head">
          <span className="pj-tile-dot" style={{ background: t.color }} />
          <div className="pj-tile-name">{t.name}</div>
          {t.stale && (
            <span
              className="pj-tile-stale"
              title="Last aligned > 30 days ago — run Refresh"
            >
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
    </div>
  );
}
