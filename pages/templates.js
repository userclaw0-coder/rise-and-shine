import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import {
  getTemplates,
  setDefaultTemplate,
  getTemplateItems,
  updateTemplateOrder,
  addTemplateItem,
  removeTemplateItem,
  getOrCreateDailyRepeatCategory,
  createTask,
  setTaskCompletionForDate,
} from "../lib/db";
import { supabase } from "../lib/supabaseClient";

const BUCKETS = [
  { id: "morning", label: "Morning", icon: "☀", sub: "Rise & set the tone", color: "var(--ps-gold)" },
  { id: "midday", label: "Midday", icon: "◐", sub: "Middle of the day", color: "var(--ps-accent)" },
  { id: "evening", label: "Evening", icon: "☾", sub: "Wind down", color: "var(--ps-indigo)" },
  { id: "anytime", label: "Anytime", icon: "◯", sub: "Any slot today", color: "var(--ps-ink-50)" },
];

const PRIO_META = {
  Critical: { label: "Critical", color: "var(--ps-clay)" },
  High: { label: "High", color: "var(--ps-accent)" },
  Medium: { label: "Medium", color: "var(--ps-indigo)" },
  Low: { label: "Low", color: "var(--ps-ink-40)" },
};

function bucketFor(title) {
  const lower = (title || "").toLowerCase();
  if (/morning|wake|am\b|6am|7am|8am|rise/.test(lower)) return "morning";
  if (/midday|noon|lunch|afternoon/.test(lower)) return "midday";
  if (/evening|night|pm\b|bed|wind|sleep/.test(lower)) return "evening";
  return "anytime";
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SortableRow({ item, done, onToggle, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const t = item.task || {};
  const pri = PRIO_META[t.priority] || PRIO_META.Medium;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={"dh-row" + (done ? " done" : "")}
    >
      <span
        className="dh-drag"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <button
        type="button"
        className="dh-check"
        aria-pressed={done}
        onClick={onToggle}
      >
        <span
          className="dh-check-dot"
          style={{
            background: done ? pri.color : "transparent",
            borderColor: pri.color,
          }}
        >
          {done && "✓"}
        </span>
      </button>
      <div className="dh-row-body">
        <div className="dh-row-name">{t.title || "(untitled)"}</div>
        <div className="dh-row-meta">
          <span className="dh-pill" style={{ color: pri.color, borderColor: pri.color + "40" }}>
            {pri.label}
          </span>
          {t.effort_hours > 0 && (
            <span className="dh-pill">{Math.round(t.effort_hours * 60)}m</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="dh-remove"
        onClick={onRemove}
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}

export default function TemplatesPage() {
  const { user } = useAuth();
  const [template, setTemplate] = useState(null);
  const [items, setItems] = useState([]);
  const [done, setDone] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addBucket, setAddBucket] = useState("anytime");
  const [addPriority, setAddPriority] = useState("Medium");
  const [adding, setAdding] = useState(false);
  const [heatByTask, setHeatByTask] = useState({});

  const dateStr = todayStr();

  const recentDates = useMemo(() => {
    const list = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      list.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`
      );
    }
    return list;
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const { data: templates, error: tErr } = await getTemplates();
      if (tErr) throw new Error(tErr.message);
      let picked =
        (templates || []).find((tpl) => tpl.user_id === user.id && tpl.is_default) ||
        (templates || []).find((tpl) => tpl.user_id === user.id) ||
        null;
      setTemplate(picked);
      if (!picked) {
        setItems([]);
        setDone({});
        setLoading(false);
        return;
      }
      const { data: rows, error: iErr } = await getTemplateItems(picked.id);
      if (iErr) throw new Error(iErr.message);
      const list = (rows || [])
        .filter((r) => r.task)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setItems(list);
      const taskIds = list.map((i) => i.task.id);
      if (taskIds.length > 0) {
        const rangeStart = (() => {
          const d = new Date(dateStr + "T00:00:00");
          d.setDate(d.getDate() - 29);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate()
          ).padStart(2, "0")}`;
        })();
        const { data: events } = await supabase
          .from("task_events")
          .select("task_id, event_type, created_at")
          .eq("user_id", user.id)
          .in("event_type", ["completed", "uncompleted"])
          .in("task_id", taskIds)
          .gte("created_at", `${rangeStart}T00:00:00Z`)
          .lt("created_at", `${dateStr}T23:59:59Z`);

        // Per task, per day: final state = latest event that day
        const perTaskDay = {};
        for (const ev of events || []) {
          const tId = ev.task_id;
          const day = new Date(ev.created_at).toISOString().slice(0, 10);
          if (!perTaskDay[tId]) perTaskDay[tId] = {};
          const prev = perTaskDay[tId][day];
          if (!prev || new Date(ev.created_at) > new Date(prev.created_at)) {
            perTaskDay[tId][day] = ev;
          }
        }

        // Today's completion map
        const doneToday = {};
        for (const id of taskIds) {
          doneToday[id] = perTaskDay[id]?.[dateStr]?.event_type === "completed";
        }
        setDone(doneToday);

        // 30-day heat grid
        const heat = {};
        for (const id of taskIds) {
          heat[id] = {};
          for (const d of recentDates) {
            heat[id][d] =
              perTaskDay[id]?.[d]?.event_type === "completed";
          }
        }
        setHeatByTask(heat);
      } else {
        setDone({});
        setHeatByTask({});
      }
    } catch (err) {
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [user, dateStr, recentDates]);

  useEffect(() => {
    load();
  }, [load]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({
      ...it,
      sort_order: idx,
    }));
    setItems(next);
    await updateTemplateOrder(next.map((it) => ({ id: it.id, sort_order: it.sort_order })));
  }

  async function toggleDone(taskId) {
    const next = !done[taskId];
    setDone((d) => ({ ...d, [taskId]: next }));
    setHeatByTask((h) => ({
      ...h,
      [taskId]: { ...(h[taskId] || {}), [dateStr]: next },
    }));
    await setTaskCompletionForDate(user.id, taskId, dateStr, next);
  }

  async function toggleHistorical(taskId, day) {
    const next = !heatByTask[taskId]?.[day];
    setHeatByTask((h) => ({
      ...h,
      [taskId]: { ...(h[taskId] || {}), [day]: next },
    }));
    if (day === dateStr) {
      setDone((d) => ({ ...d, [taskId]: next }));
    }
    await setTaskCompletionForDate(user.id, taskId, day, next);
  }

  async function handleRemove(itemId) {
    if (!window.confirm("Remove from Daily Hits?")) return;
    setItems((list) => list.filter((i) => i.id !== itemId));
    await removeTemplateItem(itemId);
  }

  async function handleAdd() {
    if (!user || !addTitle.trim() || adding) return;
    setAdding(true);
    try {
      const titleWithBucket =
        addBucket === "anytime"
          ? addTitle.trim()
          : `[${addBucket}] ${addTitle.trim()}`;
      const catRes = await getOrCreateDailyRepeatCategory(user.id);
      if (catRes.error) throw new Error(catRes.error.message);
      const taskRes = await createTask(user.id, {
        title: titleWithBucket,
        priority: addPriority,
        category_id: catRes.data.id,
      });
      if (taskRes.error) throw new Error(taskRes.error.message);
      if (!template) {
        const { data: tpl } = await supabase
          .from("daily_templates")
          .insert({ user_id: user.id, name: "Daily Hits", is_default: true })
          .select()
          .single();
        if (tpl) {
          await setDefaultTemplate(user.id, tpl.id);
          setTemplate(tpl);
        }
      }
      const tplId = template?.id;
      if (tplId) {
        await addTemplateItem(user.id, tplId, taskRes.data.id);
      }
      setAddTitle("");
      load();
    } catch (err) {
      setError(err.message || "Failed to add.");
    } finally {
      setAdding(false);
    }
  }

  const groups = useMemo(() => {
    const map = {};
    for (const it of items) {
      const bucket = bucketFor(it.task?.title);
      if (!map[bucket]) map[bucket] = [];
      map[bucket].push(it);
    }
    return BUCKETS.map((b) => ({ ...b, items: map[b.id] || [] })).filter(
      (b) => b.items.length > 0
    );
  }, [items]);

  const doneCount = items.filter((i) => done[i.task.id]).length;
  const total = items.length;
  const pct = total > 0 ? doneCount / total : 0;
  const ringR = 40;
  const ringC = 2 * Math.PI * ringR;
  const ringOff = ringC * (1 - pct);

  if (!user) return null;

  const coachPayload = {
    date: dateStr,
    total_hits: total,
    done_today: doneCount,
    not_done_today: items
      .filter((i) => !done[i.task.id])
      .slice(0, 12)
      .map((i) => ({
        title: i.task?.title,
        priority: i.task?.priority,
      })),
    done_today_titles: items
      .filter((i) => done[i.task.id])
      .slice(0, 12)
      .map((i) => i.task?.title),
  };

  return (
    <PSShell scope="hits" title="Daily Hits" coachPayload={coachPayload}>
      <div className="ps-view">
          <div className="ps-eyebrow">Daily · Daily Hits</div>
          <div className="dh-title-row">
            <div>
              <h1 className="ps-title">The day, one rep at a time.</h1>
              <p className="ps-sub">
                {total === 0
                  ? "Add your first daily hit below — priming, movement, supplements, the non-negotiables."
                  : `${doneCount} of ${total} done today. Drag to reorder. Group by time of day by prefixing the title (e.g. "[morning] priming").`}
              </p>
            </div>
            <div className="dh-day-ring">
              <svg width={110} height={110} style={{ transform: "rotate(-90deg)" }}>
                <circle
                  cx={55}
                  cy={55}
                  r={ringR}
                  fill="none"
                  stroke="var(--ps-ink-08)"
                  strokeWidth={8}
                />
                <circle
                  cx={55}
                  cy={55}
                  r={ringR}
                  fill="none"
                  stroke="var(--ps-accent)"
                  strokeWidth={8}
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOff}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 400ms" }}
                />
              </svg>
              <div className="dh-day-ring-inner">
                <div className="dh-day-frac">
                  {doneCount}
                  <span>/{total || "—"}</span>
                </div>
                <div className="dh-day-label">today</div>
              </div>
            </div>
          </div>

          {error && <div className="today-error">{error}</div>}

          <div className="dh-list">
            {loading && <div className="dh-empty">Loading…</div>}
            {!loading && groups.length === 0 && (
              <div className="dh-empty">
                No Daily Hits yet. Add one below.
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              {groups.map((b) => (
                <div key={b.id} className="dh-bucket">
                  <div className="dh-bucket-head">
                    <div className="dh-bucket-icon" style={{ color: b.color }}>
                      {b.icon}
                    </div>
                    <div>
                      <div className="dh-bucket-label">{b.label}</div>
                      <div className="dh-bucket-sub">
                        {b.sub} ·{" "}
                        {b.items.filter((i) => done[i.task.id]).length}/{b.items.length}
                      </div>
                    </div>
                    <div className="dh-bucket-line" />
                  </div>
                  <SortableContext
                    items={b.items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="dh-bucket-items">
                      {b.items.map((item) => (
                        <SortableRow
                          key={item.id}
                          item={item}
                          done={!!done[item.task.id]}
                          onToggle={() => toggleDone(item.task.id)}
                          onRemove={() => handleRemove(item.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              ))}
            </DndContext>
          </div>

          {items.length > 0 && (
            <>
              <div className="ps-section-title">Patterns · last 30 days</div>
              <div className="ps-section-sub">
                Each row is one hit, each cell one day. Click any past cell to
                retro-mark it completed or clear it.
              </div>
              <div className="dh-heat">
                <div
                  className="dh-heat-grid"
                  style={{
                    gridTemplateColumns: `minmax(120px, 1fr) repeat(30, 14px)`,
                  }}
                >
                  <div className="dh-heat-corner" />
                  {recentDates.map((d, i) => {
                    const isoDay = d.slice(8, 10);
                    const isMondayish = new Date(d + "T00:00:00").getDay() === 1;
                    return (
                      <div
                        key={d}
                        className={
                          "dh-heat-colcap" +
                          (isMondayish ? " dh-heat-colcap--m" : "") +
                          (i === recentDates.length - 1 ? " today" : "")
                        }
                        title={d}
                      >
                        {isoDay}
                      </div>
                    );
                  })}
                  {items.map((it) => {
                    const pri = PRIO_META[it.task.priority] || PRIO_META.Medium;
                    return (
                      <Fragment key={it.id}>
                        <div
                          className="dh-heat-rowlabel"
                          title={it.task.title}
                        >
                          {it.task.title}
                        </div>
                        {recentDates.map((d) => {
                          const filled = !!heatByTask[it.task.id]?.[d];
                          return (
                            <button
                              type="button"
                              key={`${it.task.id}-${d}`}
                              onClick={() => toggleHistorical(it.task.id, d)}
                              className={
                                "dh-heat-cell" + (filled ? " filled" : "")
                              }
                              style={{
                                background: filled ? pri.color : undefined,
                              }}
                              aria-label={`${it.task.title} on ${d}: ${
                                filled ? "done" : "not done"
                              }`}
                            />
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="dh-add">
            <input
              className="dh-add-input"
              placeholder="Add a Daily Hit…"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <select
              className="dh-add-sel"
              value={addBucket}
              onChange={(e) => setAddBucket(e.target.value)}
            >
              {BUCKETS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <select
              className="dh-add-sel"
              value={addPriority}
              onChange={(e) => setAddPriority(e.target.value)}
            >
              {Object.keys(PRIO_META).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              className="ps-btn ps-btn--primary"
              disabled={!addTitle.trim() || adding}
              onClick={handleAdd}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

      <style jsx global>{`
        .dh-title-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          align-items: center;
        }
        .dh-day-ring {
          position: relative;
          width: 110px;
          height: 110px;
        }
        .dh-day-ring-inner {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .dh-day-frac {
          font-family: var(--ps-serif);
          font-size: 26px;
          letter-spacing: -0.02em;
          color: var(--ps-ink);
        }
        .dh-day-frac span {
          font-size: 14px;
          color: var(--ps-ink-50);
          margin-left: 2px;
        }
        .dh-day-label {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .dh-list {
          margin-top: 28px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .dh-empty {
          padding: 28px;
          text-align: center;
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          border-radius: 12px;
          color: var(--ps-ink-60);
          font-size: 13px;
        }
        .dh-bucket {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .dh-bucket-head {
          display: grid;
          grid-template-columns: auto auto 1fr;
          gap: 12px;
          align-items: center;
        }
        .dh-bucket-icon {
          font-family: var(--ps-serif);
          font-size: 20px;
          width: 28px;
          text-align: center;
        }
        .dh-bucket-label {
          font-family: var(--ps-serif);
          font-size: 17px;
          letter-spacing: -0.01em;
        }
        .dh-bucket-sub {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .dh-bucket-line {
          height: 1px;
          background: var(--ps-ink-08);
        }
        .dh-bucket-items { display: flex; flex-direction: column; gap: 4px; }
        .dh-row {
          display: grid;
          grid-template-columns: 18px 22px 1fr 22px;
          gap: 10px;
          align-items: center;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 10px 14px;
          transition: border-color 100ms, opacity 200ms;
        }
        .dh-row.done { opacity: 0.55; }
        .dh-row:hover { border-color: var(--ps-ink-30); }
        .dh-drag {
          font-size: 12px;
          color: var(--ps-ink-30);
          cursor: grab;
          user-select: none;
        }
        .dh-drag:active { cursor: grabbing; }
        .dh-check {
          appearance: none;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dh-check-dot {
          width: 20px;
          height: 20px;
          border-radius: 5px;
          border: 1.5px solid;
          color: #fff;
          font-size: 12px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dh-row-body { min-width: 0; }
        .dh-row-name {
          font-size: 13.5px;
          color: var(--ps-ink);
          line-height: 1.35;
        }
        .dh-row.done .dh-row-name {
          text-decoration: line-through;
        }
        .dh-row-meta {
          display: flex;
          gap: 6px;
          margin-top: 3px;
          flex-wrap: wrap;
        }
        .dh-pill {
          font-family: var(--ps-mono);
          font-size: 9.5px;
          letter-spacing: 0.04em;
          padding: 1px 6px;
          border-radius: 3px;
          border: 1px solid var(--ps-ink-10);
          color: var(--ps-ink-60);
        }
        .dh-remove {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          width: 22px;
          height: 22px;
          cursor: pointer;
          color: var(--ps-ink-40);
          font-size: 16px;
          line-height: 1;
        }
        .dh-remove:hover {
          color: var(--ps-clay);
          border-color: var(--ps-clay);
        }
        .dh-heat {
          margin-top: 12px;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 14px 16px;
          overflow-x: auto;
        }
        .dh-heat-grid {
          display: grid;
          gap: 3px;
          min-width: 0;
          align-items: center;
        }
        .dh-heat-corner {
          grid-column: 1;
        }
        .dh-heat-colcap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.04em;
          text-align: center;
          color: var(--ps-ink-40);
        }
        .dh-heat-colcap.today {
          color: var(--ps-accent);
          font-weight: 600;
        }
        .dh-heat-colcap--m {
          color: var(--ps-ink-70);
        }
        .dh-heat-rowlabel {
          font-size: 12px;
          color: var(--ps-ink-70);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 10px;
          line-height: 1.4;
        }
        .dh-heat-cell {
          appearance: none;
          border: 1px solid var(--ps-ink-08);
          background: var(--ps-ink-05);
          width: 14px;
          height: 14px;
          border-radius: 3px;
          padding: 0;
          cursor: pointer;
          transition: filter 120ms;
        }
        .dh-heat-cell:hover {
          border-color: var(--ps-ink-30);
        }
        .dh-heat-cell.filled {
          border-color: transparent;
        }
        .dh-add {
          margin-top: 28px;
          padding: 14px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 10px;
          align-items: center;
        }
        .dh-add-input, .dh-add-sel {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          padding: 8px 10px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          color: var(--ps-ink);
        }
        .dh-add-input { padding: 8px 12px; }
        @media (max-width: 720px) {
          .dh-title-row { grid-template-columns: 1fr; }
          .dh-day-ring { justify-self: start; }
          .dh-add { grid-template-columns: 1fr; }
        }
      `}</style>
    </PSShell>
  );
}
