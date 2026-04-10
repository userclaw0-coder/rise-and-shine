import { useState, useMemo } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * ProjectPlanView — Plan of Attack with drag-and-drop reordering.
 * Root tasks and subtasks are independently sortable.
 */
export default function ProjectPlanView({
  tasks,
  childrenByParent,
  completionMap,
  onToggleCompletion,
  onSubtaskCompletion,
  onAddTask,
  onJarvisBreakDown,
  onReorderRoots,
  onReorderSubtasks,
  todayStr,
}) {
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Use task order as-is (parent controls ordering via orderIds)
  const orderedTasks = tasks || [];

  // Find the "active" task — first undone, or one with status "doing"
  const activeTaskId = useMemo(() => {
    const doing = orderedTasks.find((t) => t.status === "doing");
    if (doing) return doing.id;
    const firstUndone = orderedTasks.find((t) => t.status !== "done" && t.status !== "archived");
    return firstUndone?.id || null;
  }, [orderedTasks]);

  const isExpanded = (taskId) => {
    if (expandedTaskId === taskId) return true;
    if (expandedTaskId === null && taskId === activeTaskId) return true;
    return false;
  };

  const toggleExpand = (taskId) => {
    setExpandedTaskId((prev) => (prev === taskId ? "__none__" : taskId));
  };

  const handleRootDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedTasks.findIndex((t) => t.id === active.id);
    const newIndex = orderedTasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(orderedTasks, oldIndex, newIndex);
    onReorderRoots?.(newOrder.map((t) => t.id));
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="ppv">
        <p style={{ fontSize: 13, color: "var(--rs-text-muted, #8a8478)", margin: 0 }}>
          No tasks yet. Add high-level project phases or ask Jarvis to create a plan.
        </p>
      </div>
    );
  }

  const rootIds = orderedTasks.map((t) => t.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRootDragEnd}>
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        <div className="ppv">
          {orderedTasks.map((task) => {
            const isDone = task.status === "done" || task.status === "archived";
            const isActive = task.id === activeTaskId && !isDone;
            const expanded = isExpanded(task.id);
            const subtasks = (childrenByParent instanceof Map ? childrenByParent.get(task.id) : childrenByParent?.[task.id]) || [];

            return (
              <SortableRootTask
                key={task.id}
                task={task}
                isDone={isDone}
                isActive={isActive}
                expanded={expanded}
                subtasks={subtasks}
                completionMap={completionMap}
                onToggleExpand={toggleExpand}
                onSubtaskCompletion={onSubtaskCompletion}
                onJarvisBreakDown={onJarvisBreakDown}
                onReorderSubtasks={onReorderSubtasks}
                todayStr={todayStr}
                sensors={sensors}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRootTask({
  task,
  isDone,
  isActive,
  expanded,
  subtasks,
  completionMap,
  onToggleExpand,
  onSubtaskCompletion,
  onJarvisBreakDown,
  onReorderSubtasks,
  todayStr,
  sensors,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
  const hasSubtasks = subtasks.length > 0;

  const handleSubtaskDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(subtasks, oldIndex, newIndex);
    onReorderSubtasks?.(task.id, newOrder.map((s) => s.id));
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`ppv__item ${isDone ? "ppv__item--done" : ""} ${isActive ? "ppv__item--active" : ""}`}
    >
      {/* Drag handle */}
      <div
        className="ppv__drag-handle"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drag_indicator</span>
      </div>

      <span
        className={`ppv__status-dot ppv__status-dot--${isDone ? "done" : task.status === "doing" ? "doing" : "todo"}`}
      />

      <div className="ppv__content" onClick={() => onToggleExpand(task.id)}>
        <div className="ppv__title">{task.title}</div>
        <div className="ppv__meta">
          <span className={`ppv__priority ppv__priority--${task.priority || "Medium"}`}>
            {task.priority || "Medium"}
          </span>
          {task.effort_hours ? (
            <span>
              {task.effort_hours < 1
                ? `${Math.round(task.effort_hours * 60)}m`
                : `${task.effort_hours}h`}
            </span>
          ) : null}
          {hasSubtasks && (
            <span>{doneSubtasks}/{subtasks.length} subtasks</span>
          )}
          {task.due_date && (
            <span
              style={{
                color: task.due_date < todayStr ? "var(--rs-danger, #c0392b)" : undefined,
                fontWeight: task.due_date <= todayStr ? 600 : 400,
              }}
            >
              {task.due_date === todayStr
                ? "Due today"
                : task.due_date < todayStr
                ? "Overdue"
                : `Due ${task.due_date}`}
            </span>
          )}
          {isDone && <span style={{ color: "#22c55e" }}>Done</span>}
        </div>

        {/* Expanded: subtasks with DnD, or Jarvis button */}
        {expanded && !isDone && (
          <>
            {hasSubtasks ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
                <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="ppv__subtasks" onClick={(e) => e.stopPropagation()}>
                    {subtasks.map((sub) => (
                      <SortableSubtask
                        key={sub.id}
                        sub={sub}
                        completionMap={completionMap}
                        onSubtaskCompletion={onSubtaskCompletion}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <button
                type="button"
                className="ppv__jarvis-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onJarvisBreakDown?.(task);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_toy</span>
                Break this down with Jarvis
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SortableSubtask({ sub, completionMap, onSubtaskCompletion }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sub.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const subDone = sub.status === "done" || !!completionMap?.[sub.id];

  return (
    <div ref={setNodeRef} style={style} className="ppv__subtask">
      <div
        className="ppv__subtask-drag"
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>drag_indicator</span>
      </div>
      <input
        type="checkbox"
        className="ppv__subtask-checkbox"
        checked={subDone}
        onChange={() => onSubtaskCompletion?.(sub.id)}
      />
      <span className={`ppv__subtask-title ${subDone ? "ppv__subtask-title--done" : ""}`}>
        {sub.title}
      </span>
      {sub.effort_hours ? (
        <span className="ppv__subtask-effort">
          {sub.effort_hours < 1
            ? `${Math.round(sub.effort_hours * 60)}m`
            : `${sub.effort_hours}h`}
        </span>
      ) : null}
    </div>
  );
}
