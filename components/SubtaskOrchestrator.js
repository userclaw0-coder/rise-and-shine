import { useState } from "react";

/**
 * Review/edit/approve flow for AI-generated subtasks.
 *
 * Props:
 *  - subtasks: Array<{ title, parent_task_id, estimated_minutes?, tags? }>
 *  - parentTitleById: Map<string, string>
 *  - onApply: (approved: subtask[]) => Promise<void>  — called with approved items
 *  - onDismissAll: () => void
 *  - applying: boolean
 */
export default function SubtaskOrchestrator({
  subtasks,
  parentTitleById,
  onApply,
  onDismissAll,
  applying,
}) {
  const [items, setItems] = useState(() =>
    (subtasks || []).map((s, i) => ({
      ...s,
      _key: `orch-${s.parent_task_id}-${i}`,
      _approved: true,
      _editTitle: s.title || "Untitled subtask",
    }))
  );

  function toggleApproval(index) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, _approved: !it._approved } : it
      )
    );
  }

  function updateTitle(index, value) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, _editTitle: value } : it
      )
    );
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const approved = items.filter((it) => it._approved);
  const hasApproved = approved.length > 0;

  function handleApply() {
    if (!hasApproved || applying) return;
    const payload = approved.map((it) => ({
      title: it._editTitle || it.title,
      parent_task_id: it.parent_task_id,
      estimated_minutes: it.estimated_minutes,
      tags: it.tags,
    }));
    onApply(payload);
  }

  if (items.length === 0) return null;

  return (
    <div>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "0 0 4px",
          color: "#374151",
        }}
      >
        Subtask orchestration
      </h3>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
        Review and edit subtasks below. The first approved subtask will be
        promoted to your Next-3 queue; remaining approved subtasks go to
        backlog.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, idx) => (
          <div
            key={item._key}
            style={{
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${item._approved ? "#a7f3d0" : "#e5e7eb"}`,
              background: item._approved ? "#ecfdf5" : "#f9fafb",
              opacity: item._approved ? 1 : 0.7,
              transition: "all 150ms ease",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              Parent:{" "}
              {parentTitleById?.get(item.parent_task_id) ??
                item.parent_task_id}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <input
                type="checkbox"
                checked={item._approved}
                onChange={() => toggleApproval(idx)}
                title={item._approved ? "Deselect" : "Approve"}
                style={{ flexShrink: 0 }}
              />
              <input
                type="text"
                value={item._editTitle}
                onChange={(e) => updateTitle(idx, e.target.value)}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {item.estimated_minutes != null && (
                  <span>~{item.estimated_minutes} min</span>
                )}
                {item.tags?.length > 0 && (
                  <span style={{ marginLeft: 8 }}>
                    {item.tags.join(", ")}
                  </span>
                )}
              </div>

              {idx === 0 && item._approved && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#059669",
                    background: "#d1fae5",
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  → Next-3
                </span>
              )}
              {idx > 0 && item._approved && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#6b7280",
                    background: "#f3f4f6",
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  → Backlog
                </span>
              )}

              <button
                type="button"
                onClick={() => removeItem(idx)}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#6b7280",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={handleApply}
          disabled={!hasApproved || applying}
          style={{
            fontSize: 13,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid #059669",
            background: "#059669",
            color: "#fff",
            cursor: hasApproved && !applying ? "pointer" : "not-allowed",
            opacity: hasApproved && !applying ? 1 : 0.6,
          }}
        >
          {applying
            ? "Applying…"
            : `Apply ${approved.length} subtask${approved.length !== 1 ? "s" : ""}`}
        </button>
        <button
          type="button"
          onClick={onDismissAll}
          disabled={applying}
          style={{
            fontSize: 13,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#6b7280",
            cursor: applying ? "not-allowed" : "pointer",
          }}
        >
          Dismiss all
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          {approved.length > 0
            ? `#1 → Next-3 queue · #2+ → Backlog`
            : "Select at least one subtask"}
        </span>
      </div>
    </div>
  );
}
