/**
 * Stitch-style strategic initiative card for Action Items (root tasks).
 * Subtasks: preview + expand; tags: pill preview + expand.
 */

import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const SUBTASK_PREVIEW = 2;
const TAG_PILL_PREVIEW = 4;

const CATEGORY_PILL_PALETTES = [
  { bg: "rgba(174, 64, 37, 0.12)", fg: "#7a3d2c" },
  { bg: "rgba(212, 175, 55, 0.2)", fg: "#5c4800" },
  { bg: "rgba(85, 93, 30, 0.14)", fg: "#3d4418" },
  { bg: "rgba(127, 92, 83, 0.14)", fg: "#5c4038" },
  { bg: "rgba(90, 118, 142, 0.14)", fg: "#3d5163" },
];

export function categoryPillPalette(categoryId) {
  if (!categoryId) return CATEGORY_PILL_PALETTES[0];
  let h = 0;
  const s = String(categoryId);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CATEGORY_PILL_PALETTES[h % CATEGORY_PILL_PALETTES.length];
}

export function backlogStatusLabel(status) {
  if (status === "doing") return "IN PROGRESS";
  if (status === "done") return "DONE";
  if (status === "archived") return "ARCHIVED";
  return "TO DO";
}

export function formatDueMd(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function extractTagNames(task) {
  if (!task || !task.tags) return [];
  const result = [];
  for (const t of task.tags) {
    if (!t) continue;
    if (typeof t === "string") result.push(t);
    else if (t.tag && t.tag.name) result.push(t.tag.name);
    else if (t.name) result.push(t.name);
  }
  return result;
}

const inputBase = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: "var(--rs-radius-sm)",
  border: "1px solid rgba(186, 177, 159, 0.22)",
  background: "var(--rs-surface-raised)",
  color: "var(--rs-on-surface)",
};

export default function BacklogStrategicTaskCard({
  task,
  sortedChildren,
  categories,
  memberOptions = [],
  profile,
  lifeDomainLabel,
  LIFE_DOMAIN_KEYS,
  expandedSubtasks,
  onToggleSubtasksExpanded,
  expandedTagPills,
  onToggleTagPills,
  updateTaskLocal,
  handleInlineSave,
  handleStatusChange,
  handleSubcategorySave,
  handleTagsSave,
  handleAddSubtask,
  handleAssignTask,
  onReorderSubtasks,
  tagText,
  simplified = false,
  expanded = true,
  onToggleExpanded,
}) {
  const isDone = task.status === "done";
  const cat =
    task.category?.name ||
    categories.find((c) => c.id === task.category_id)?.name ||
    "";
  const palette = categoryPillPalette(task.category_id);
  const dueShort = formatDueMd(task.due_date);
  const score = task._aiPriorityScore;
  const scoreNum = Number.isFinite(score) ? score : null;
  const scoreHot = scoreNum != null && scoreNum >= 65;
  const tagNames = extractTagNames(task);
  const permissions = task._permissions || {
    can_edit: true,
    can_change_status: true,
    can_assign: true,
  };
  const currentAssigneeId = task.assignees?.[0]?.user_id || "";
  const currentAssigneeLabel = task.assignees?.[0]?.email || "";
  const visibleTags = expandedTagPills ? tagNames : tagNames.slice(0, TAG_PILL_PREVIEW);
  /** Tags not in the collapsed preview — same as how many re-hide on collapse (not “currently hidden” when expanded). */
  const tagsBeyondPreview = Math.max(0, tagNames.length - TAG_PILL_PREVIEW);

  const showAllSubs = expandedSubtasks || sortedChildren.length <= SUBTASK_PREVIEW;
  const visibleChildren = showAllSubs
    ? sortedChildren
    : sortedChildren.slice(0, SUBTASK_PREVIEW);
  const hiddenSubCount = sortedChildren.length - SUBTASK_PREVIEW;

  const checkbox = (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 40,
        minHeight: 40,
        cursor: "pointer",
        flexShrink: 0,
      }}
      title="Mark complete"
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={(e) => handleStatusChange(task, e.target.checked ? "done" : "todo")}
        disabled={!permissions.can_change_status}
        style={{ width: 20, height: 20, accentColor: "var(--rs-accent-gold)", cursor: "pointer" }}
      />
    </label>
  );

  if (simplified && !expanded) {
    return (
      <article className="rs-backlog-card rs-backlog-card--simple">
        <div className="rs-backlog-card__simple-main">
          <div className="rs-backlog-card__simple-title">{task.title || "Untitled task"}</div>
          {(currentAssigneeLabel || task._permissions?.role) && (
            <div className="rs-backlog-card__simple-assignee">
              {currentAssigneeLabel ? `Assigned: ${currentAssigneeLabel}` : `Role: ${task._permissions?.role || "viewer"}`}
            </div>
          )}
          <button
            type="button"
            className="rs-btn-ghost rs-backlog-card__simple-expand"
            onClick={onToggleExpanded}
          >
            Expand
          </button>
        </div>
        <div
          className={`rs-backlog-card__score rs-backlog-card__score--simple${scoreHot ? " rs-backlog-card__score--hot" : ""}`}
          title="AI strategic priority score"
        >
          <div className="rs-backlog-card__score-value">
            {scoreNum != null ? scoreNum.toFixed(1) : "—"}
          </div>
          <div className="rs-backlog-card__score-label">STRATEGIC SCORE</div>
        </div>
      </article>
    );
  }

  return (
    <article className="rs-backlog-card">
      <div className="rs-backlog-card__meta">
        <span
          className="rs-backlog-card__category-pill"
          style={{ background: palette.bg, color: palette.fg }}
        >
          {(cat || "Uncategorized").toUpperCase()}
        </span>
        <span className="rs-backlog-card__meta-dot" aria-hidden>
          ·
        </span>
        {dueShort ? (
          <>
            <span className="material-symbols-outlined rs-backlog-card__meta-icon" aria-hidden>
              calendar_today
            </span>
            <span className="rs-backlog-card__meta-text">DUE: {dueShort}</span>
          </>
        ) : (
          <span className="rs-backlog-card__meta-text">NO DUE DATE</span>
        )}
        <span className="rs-backlog-card__meta-dot" aria-hidden>
          ·
        </span>
        <span className="rs-backlog-card__meta-text">{backlogStatusLabel(task.status)}</span>
      </div>

      <div className="rs-backlog-card__hero">
        <div className="rs-backlog-card__title-row">
          {checkbox}
          <textarea
            rows={2}
            value={task.title || ""}
            onChange={(e) => updateTaskLocal(task.id, { title: e.target.value })}
            onBlur={(e) => handleInlineSave(task.id, { title: e.target.value })}
            disabled={!permissions.can_edit}
            className="rs-backlog-card__title-input"
            style={{
              textDecoration: isDone ? "line-through" : "none",
              opacity: isDone ? 0.75 : 1,
            }}
            placeholder="Task title…"
          />
        </div>
        <div
          className={`rs-backlog-card__score${scoreHot ? " rs-backlog-card__score--hot" : ""}`}
          title="AI strategic priority score"
        >
          <div className="rs-backlog-card__score-value">
            {scoreNum != null ? scoreNum.toFixed(1) : "—"}
          </div>
          <div className="rs-backlog-card__score-label">STRATEGIC SCORE</div>
        </div>
      </div>

      {sortedChildren.length > 0 && (
        <div className="rs-backlog-card__subtasks-wrap">
          <div className="rs-backlog-card__subtasks-label">Subtasks</div>
          <SubtaskDndList
            visibleChildren={visibleChildren}
            task={task}
            permissions={permissions}
            handleStatusChange={handleStatusChange}
            updateTaskLocal={updateTaskLocal}
            handleInlineSave={handleInlineSave}
            onReorderSubtasks={onReorderSubtasks}
          />
          {hiddenSubCount > 0 && (
            <button
              type="button"
              className="rs-backlog-card__more-link"
              onClick={onToggleSubtasksExpanded}
            >
              {showAllSubs
                ? "Show fewer subtasks"
                : `+ ${hiddenSubCount} more subtask${hiddenSubCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}

      <div className="rs-backlog-card__details">
        <div className="rs-backlog-card__detail-grid">
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Category</span>
            <select
              value={task.category_id || ""}
              disabled={!permissions.can_edit}
              onChange={(e) => {
                const cid = e.target.value || null;
                updateTaskLocal(task.id, {
                  category_id: cid,
                  subcategory_id: null,
                  _subcategoryText: "",
                  subcategory: null,
                });
                handleInlineSave(task.id, { category_id: cid, subcategory_id: null });
              }}
              style={{ ...inputBase, width: "100%" }}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Subcategory</span>
            <input
              type="text"
              value={task._subcategoryText ?? task?.subcategory?.name ?? ""}
              placeholder="Optional"
              disabled={!permissions.can_edit}
              onChange={(e) => updateTaskLocal(task.id, { _subcategoryText: e.target.value })}
              onBlur={() => handleSubcategorySave(task)}
              list={task.category_id ? `subcategory-options-${task.category_id}` : undefined}
              style={{ ...inputBase, width: "100%" }}
            />
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Priority</span>
            <select
              value={task.priority || "Medium"}
              disabled={!permissions.can_edit}
              onChange={(e) => handleInlineSave(task.id, { priority: e.target.value })}
              style={{ ...inputBase, width: "100%" }}
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Effort (hrs)</span>
            <input
              type="number"
              step="0.25"
              value={task.effort_hours ?? ""}
              placeholder="—"
              disabled={!permissions.can_edit}
              onChange={(e) =>
                updateTaskLocal(task.id, {
                  effort_hours: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              onBlur={(e) =>
                handleInlineSave(task.id, {
                  effort_hours: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              style={{ ...inputBase, width: "100%" }}
            />
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Due</span>
            <input
              type="date"
              value={task.due_date || ""}
              disabled={!permissions.can_edit}
              onChange={(e) => {
                updateTaskLocal(task.id, { due_date: e.target.value || null });
                handleInlineSave(task.id, { due_date: e.target.value || null });
              }}
              style={{ ...inputBase, width: "100%" }}
            />
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Status</span>
            <select
              value={task.status || "todo"}
              disabled={!permissions.can_change_status}
              onChange={(e) => handleStatusChange(task, e.target.value)}
              style={{ ...inputBase, width: "100%" }}
            >
              <option value="todo">Todo</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Outcome</span>
            <select
              value={(Array.isArray(task.outcome_ids) && task.outcome_ids[0]) || ""}
              disabled={!permissions.can_edit}
              onChange={(e) => {
                const v = e.target.value || null;
                const outcome_ids = v ? [v] : [];
                updateTaskLocal(task.id, { outcome_ids });
                handleInlineSave(task.id, {
                  outcome_ids,
                  primary_life_domain: task.primary_life_domain || undefined,
                  alignment_source: "user",
                });
              }}
              style={{ ...inputBase, width: "100%" }}
            >
              <option value="">—</option>
              {(profile?.desired_outcomes || []).map((o) => (
                <option key={o.id || o.title} value={o.id || o.title}>
                  {(o.title || o.id || "").slice(0, 48)}
                </option>
              ))}
            </select>
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Human need strategy</span>
            <select
              value={task.primary_life_domain || ""}
              disabled={!permissions.can_edit}
              onChange={(e) => {
                const v = e.target.value || null;
                updateTaskLocal(task.id, { primary_life_domain: v });
                handleInlineSave(task.id, {
                  outcome_ids: task.outcome_ids,
                  primary_life_domain: v || null,
                  alignment_source: "user",
                });
              }}
              style={{ ...inputBase, width: "100%" }}
            >
              <option value="">—</option>
              {LIFE_DOMAIN_KEYS.map((key) => (
                <option key={key} value={key}>
                  {lifeDomainLabel(key, profile) || key}
                </option>
              ))}
            </select>
          </label>
          <label className="rs-backlog-card__field">
            <span className="rs-backlog-card__field-label">Assignee</span>
            <select
              value={currentAssigneeId}
              disabled={!permissions.can_assign}
              onChange={(e) => handleAssignTask?.(task, e.target.value || null)}
              style={{ ...inputBase, width: "100%" }}
            >
              <option value="">Unassigned</option>
              {memberOptions.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.email || member.user_id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rs-backlog-card__actions">
        {simplified && onToggleExpanded && (
          <button
            type="button"
            className="rs-btn-ghost rs-backlog-card__action-btn"
            onClick={onToggleExpanded}
          >
            Collapse
          </button>
        )}
        <button
          type="button"
          className="rs-btn-ghost rs-backlog-card__action-btn"
          onClick={() => handleAddSubtask(task)}
          disabled={!permissions.can_edit}
        >
          + Subtask
        </button>
        {task.status === "archived" ? (
          <button
            type="button"
            className="rs-btn-ghost rs-backlog-card__action-btn"
            onClick={() => handleStatusChange(task, "todo")}
            disabled={!permissions.can_change_status}
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            className="rs-backlog-card__archive-btn"
            onClick={() => handleStatusChange(task, "archived")}
            disabled={!permissions.can_change_status}
          >
            Archive
          </button>
        )}
      </div>

      <div className="rs-backlog-card__tags-section">
        {tagNames.length > 0 && (
          <div className="rs-backlog-card__tag-pills">
            {visibleTags.map((name, idx) => (
              <span key={`${name}-${idx}`} className="rs-backlog-card__tag-pill">
                {name}
              </span>
            ))}
            {!expandedTagPills && tagsBeyondPreview > 0 && (
              <button
                type="button"
                className="rs-backlog-card__more-tags"
                onClick={onToggleTagPills}
                aria-expanded={false}
                aria-label={`Show ${tagsBeyondPreview} more tag${tagsBeyondPreview === 1 ? "" : "s"}`}
              >
                + {tagsBeyondPreview} more
              </button>
            )}
            {expandedTagPills && tagsBeyondPreview > 0 && (
              <button
                type="button"
                className="rs-backlog-card__more-tags"
                onClick={onToggleTagPills}
                aria-expanded
                aria-label={`Hide ${tagsBeyondPreview} tag${tagsBeyondPreview === 1 ? "" : "s"} beyond the first ${TAG_PILL_PREVIEW}`}
              >
                {tagsBeyondPreview === 1 ? "Hide 1 tag" : `Hide ${tagsBeyondPreview} tags`}
              </button>
            )}
          </div>
        )}
        <input
          type="text"
          value={tagText}
          disabled={!permissions.can_edit}
          onChange={(e) => updateTaskLocal(task.id, { _tagsText: e.target.value })}
          onBlur={(e) => handleTagsSave(task.id, e.target.value)}
          placeholder="Tags (comma separated)"
          className="rs-input"
          style={{ marginTop: tagNames.length > 0 ? 10 : 0 }}
        />
      </div>
    </article>
  );
}

function SubtaskDndList({ visibleChildren, task, permissions, handleStatusChange, updateTaskLocal, handleInlineSave, onReorderSubtasks }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = visibleChildren.findIndex((c) => c.id === active.id);
    const newIdx = visibleChildren.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const newOrder = arrayMove(visibleChildren, oldIdx, newIdx).map((c) => c.id);
    onReorderSubtasks?.(task.id, newOrder);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleChildren.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="rs-backlog-card__subtasks">
          {visibleChildren.map((child) => (
            <SortableSubtaskRow
              key={child.id}
              child={child}
              permissions={permissions}
              handleStatusChange={handleStatusChange}
              updateTaskLocal={updateTaskLocal}
              handleInlineSave={handleInlineSave}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableSubtaskRow({ child, permissions, handleStatusChange, updateTaskLocal, handleInlineSave }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: child.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const cDone = child.status === "done";

  return (
    <li ref={setNodeRef} style={style} className="rs-backlog-card__subtask">
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          color: "var(--rs-text-muted, #8a8478)",
          opacity: 0.3,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          touchAction: "none",
          padding: "0 2px",
        }}
        title="Drag to reorder"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>drag_indicator</span>
      </div>
      <input
        type="checkbox"
        checked={cDone}
        onChange={(e) => handleStatusChange(child, e.target.checked ? "done" : "todo")}
        disabled={!(child._permissions?.can_change_status ?? permissions.can_change_status)}
        style={{
          width: 18,
          height: 18,
          marginTop: 4,
          accentColor: "var(--rs-accent-gold)",
          cursor: "pointer",
          flexShrink: 0,
        }}
        aria-label={`Complete ${child.title}`}
      />
      <input
        type="text"
        value={child.title || ""}
        onChange={(e) => updateTaskLocal(child.id, { title: e.target.value })}
        onBlur={(e) => handleInlineSave(child.id, { title: e.target.value })}
        disabled={!(child._permissions?.can_edit ?? permissions.can_edit)}
        className="rs-backlog-card__subtask-title"
        style={{
          ...inputBase,
          flex: 1,
          minWidth: 0,
          textDecoration: cDone ? "line-through" : "none",
          opacity: cDone ? 0.8 : 1,
        }}
      />
      <select
        value={child.status || "todo"}
        onChange={(e) => handleStatusChange(child, e.target.value)}
        disabled={!(child._permissions?.can_change_status ?? permissions.can_change_status)}
        style={{ ...inputBase, width: "auto", minWidth: 100, fontSize: 12 }}
      >
        <option value="todo">Todo</option>
        <option value="doing">Doing</option>
        <option value="done">Done</option>
        <option value="archived">Archived</option>
      </select>
    </li>
  );
}
