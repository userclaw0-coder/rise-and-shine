function getPhase({ aiLoading, aiError, aiSuggestions, queueReady }) {
  if (aiLoading) return "loading";
  if (aiError && !aiSuggestions) return "error";

  if (aiSuggestions) {
    const total =
      (aiSuggestions.task_refinements?.length || 0) +
      (aiSuggestions.suggested_subtasks_to_create?.length || 0) +
      (aiSuggestions.automation_opportunities?.length || 0);
    return total > 0 ? "review" : "done";
  }

  return queueReady ? "idle" : "idle-no-queue";
}

const PHASE_CONTENT = {
  "idle-no-queue": {
    label: "Waiting for queue",
    hint: "Fill your Next 3 queue first, then use AI to refine your plan.",
    icon: "○",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
  idle: {
    label: "Ready",
    hint: "Tap \"Refine these 3 with AI\" to get suggestions. Your tasks stay unchanged until you explicitly approve something.",
    icon: "○",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
  loading: {
    label: "Analyzing your queue…",
    hint: "The planner is reviewing your Next 3. This usually takes a few seconds.",
    icon: "◌",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
  error: {
    label: "Something went wrong",
    hint: "You can try again safely — nothing was changed. If the error persists, your tasks remain exactly as they were.",
    icon: "△",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  review: {
    label: "Suggestions ready — review below",
    hint: "Approve a suggestion to apply it, or dismiss to skip. Nothing changes unless you say so.",
    icon: "●",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
  done: {
    label: "All suggestions reviewed",
    hint: "You're up to date. Refine again anytime to get fresh suggestions.",
    icon: "✓",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
};

export default function AiPlannerGuidance({
  aiLoading,
  aiError,
  aiSuggestions,
  queueReady,
}) {
  const phase = getPhase({ aiLoading, aiError, aiSuggestions, queueReady });
  const content = PHASE_CONTENT[phase];
  if (!content) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        background: content.bg,
        border: `1px solid ${content.border}`,
        marginBottom: 12,
        fontSize: 12,
        lineHeight: 1.5,
        color: content.color,
      }}
    >
      <span
        aria-hidden="true"
        style={{ flexShrink: 0, fontSize: 14, lineHeight: "18px" }}
      >
        {content.icon}
      </span>
      <div>
        <div style={{ fontWeight: 600 }}>{content.label}</div>
        <div style={{ color: "#4b5563", marginTop: 2 }}>{content.hint}</div>
      </div>
    </div>
  );
}
