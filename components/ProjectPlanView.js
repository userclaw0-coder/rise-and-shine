import { useState, useMemo } from "react";

/**
 * ProjectPlanView — Plan of Attack view for a project.
 * Shows root tasks ordered by priority with done/active/queued states.
 * Active task expands to show subtasks. Tasks without subtasks show "Break this down" button.
 */
export default function ProjectPlanView({
  tasks,
  childrenByParent,
  completionMap,
  onToggleCompletion,
  onSubtaskCompletion,
  onAddTask,
  onJarvisBreakDown,
  todayStr,
}) {
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  // Sort: done at bottom, then by priority, then by creation order
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const sortedTasks = useMemo(() => {
    const sorted = [...(tasks || [])];
    sorted.sort((a, b) => {
      const aDone = a.status === "done" || a.status === "archived";
      const bDone = b.status === "done" || b.status === "archived";
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aPri = priorityOrder[a.priority] ?? 2;
      const bPri = priorityOrder[b.priority] ?? 2;
      if (aPri !== bPri) return aPri - bPri;
      return 0;
    });
    return sorted;
  }, [tasks]);

  // Find the "active" task — first undone task, or one with status "doing"
  const activeTaskId = useMemo(() => {
    const doing = sortedTasks.find((t) => t.status === "doing");
    if (doing) return doing.id;
    const firstUndone = sortedTasks.find((t) => t.status !== "done" && t.status !== "archived");
    return firstUndone?.id || null;
  }, [sortedTasks]);

  const isExpanded = (taskId) => {
    if (expandedTaskId === taskId) return true;
    if (expandedTaskId === null && taskId === activeTaskId) return true;
    return false;
  };

  const toggleExpand = (taskId) => {
    setExpandedTaskId((prev) => (prev === taskId ? "__none__" : taskId));
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

  return (
    <div className="ppv">
      {sortedTasks.map((task) => {
        const isDone = task.status === "done" || task.status === "archived";
        const isActive = task.id === activeTaskId && !isDone;
        const expanded = isExpanded(task.id);
        const subtasks = childrenByParent?.[task.id] || [];
        const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
        const hasSubtasks = subtasks.length > 0;

        return (
          <div
            key={task.id}
            className={`ppv__item ${isDone ? "ppv__item--done" : ""} ${isActive ? "ppv__item--active" : ""}`}
            onClick={() => toggleExpand(task.id)}
          >
            <span
              className={`ppv__status-dot ppv__status-dot--${isDone ? "done" : task.status === "doing" ? "doing" : "todo"}`}
            />
            <div className="ppv__content">
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
                {isDone && (
                  <span style={{ color: "#22c55e" }}>Done</span>
                )}
              </div>

              {/* Expanded: show subtasks or Jarvis button */}
              {expanded && !isDone && (
                <>
                  {hasSubtasks ? (
                    <div className="ppv__subtasks">
                      {subtasks.slice(0, 8).map((sub) => {
                        const subDone = sub.status === "done" || !!completionMap?.[sub.id];
                        return (
                          <div key={sub.id} className="ppv__subtask">
                            <input
                              type="checkbox"
                              className="ppv__subtask-checkbox"
                              checked={subDone}
                              onChange={(e) => {
                                e.stopPropagation();
                                onSubtaskCompletion?.(sub.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
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
                      })}
                      {subtasks.length > 8 && (
                        <div className="ppv__more-subtasks">
                          +{subtasks.length - 8} more subtasks
                        </div>
                      )}
                    </div>
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
      })}
    </div>
  );
}
