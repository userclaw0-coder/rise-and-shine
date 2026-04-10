import { useState, useMemo } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * SortableTaskList — Reusable drag-and-drop task list for Action Items.
 * Used by both the project page and the backlog page.
 * Root tasks are sortable. Expanded subtasks are independently sortable.
 */
export default function SortableTaskList({
  tasks,
  childrenByParent,
  orderIds,
  subtaskOrderIds,
  onReorderRoots,
  onReorderSubtasks,
  renderTask,
  renderSubtask,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Apply manual order: ordered first, then unordered, done at bottom
  const orderedTasks = useMemo(() => {
    const ids = orderIds || [];
    const byId = new Map((tasks || []).map((t) => [t.id, t]));
    const inOrder = ids.map((id) => byId.get(id)).filter(Boolean);
    const remaining = (tasks || []).filter((t) => !ids.includes(t.id));
    const all = [...inOrder, ...remaining];
    const undone = all.filter((t) => t.status !== "done" && t.status !== "archived");
    const done = all.filter((t) => t.status === "done" || t.status === "archived");
    return [...undone, ...done];
  }, [tasks, orderIds]);

  const handleRootDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedTasks.findIndex((t) => t.id === active.id);
    const newIndex = orderedTasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(orderedTasks, oldIndex, newIndex);
    onReorderRoots?.(newOrder.map((t) => t.id));
  };

  const rootIds = orderedTasks.map((t) => t.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRootDragEnd}>
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        <div className="stl">
          {orderedTasks.map((task) => {
            const children = (childrenByParent instanceof Map
              ? childrenByParent.get(task.id)
              : childrenByParent?.[task.id]) || [];

            // Apply subtask ordering
            const subOrder = subtaskOrderIds?.[task.id] || [];
            const orderedChildren = applyOrder(children, subOrder);

            return (
              <SortableRootItem
                key={task.id}
                task={task}
                orderedChildren={orderedChildren}
                renderTask={renderTask}
                renderSubtask={renderSubtask}
                onReorderSubtasks={onReorderSubtasks}
                sensors={sensors}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function applyOrder(items, orderIds) {
  if (!orderIds || orderIds.length === 0) return items;
  const byId = new Map(items.map((t) => [t.id, t]));
  const inOrder = orderIds.map((id) => byId.get(id)).filter(Boolean);
  const remaining = items.filter((t) => !orderIds.includes(t.id));
  return [...inOrder, ...remaining];
}

function SortableRootItem({ task, orderedChildren, renderTask, renderSubtask, onReorderSubtasks, sensors }) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleSubDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedChildren.findIndex((s) => s.id === active.id);
    const newIndex = orderedChildren.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(orderedChildren, oldIndex, newIndex);
    onReorderSubtasks?.(task.id, newOrder.map((s) => s.id));
  };

  const hasChildren = orderedChildren.length > 0;

  return (
    <div ref={setNodeRef} style={style} className="stl__root-item">
      <div className="stl__root-row">
        <div className="stl__drag-handle" {...attributes} {...listeners}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drag_indicator</span>
        </div>
        <div className="stl__task-content" style={{ flex: 1, minWidth: 0 }}>
          {renderTask(task, {
            expanded,
            toggleExpanded: () => setExpanded(!expanded),
            childCount: orderedChildren.length,
          })}
        </div>
      </div>

      {/* Expandable subtasks with DnD */}
      {expanded && hasChildren && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubDragEnd}>
          <SortableContext items={orderedChildren.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="stl__subtasks">
              {orderedChildren.map((sub) => (
                <SortableSubItem key={sub.id} sub={sub} renderSubtask={renderSubtask} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableSubItem({ sub, renderSubtask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sub.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="stl__sub-item">
      <div className="stl__sub-drag" {...attributes} {...listeners}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>drag_indicator</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {renderSubtask(sub)}
      </div>
    </div>
  );
}
