function getPhase({ aiLoading, aiError, aiStatus, aiSuggestions, queueReady }) {
  if (aiLoading) return "loading";
  if (typeof aiStatus === "string" && aiStatus.startsWith("fallback:")) return "fallback";
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

function humanizePlannerReason(reason) {
  if (!reason || typeof reason !== "string") return "";

  const normalized = reason.trim().toLowerCase();

  if (
    normalized.includes("auth session missing") ||
    normalized.includes("sign in again") ||
    normalized.includes("jwt") ||
    normalized.includes("token")
  ) {
    return "Your session needs to be refreshed before the planner can run.";
  }

  if (
    normalized.includes("non-json") ||
    normalized.includes("raw") ||
    normalized.includes("parse")
  ) {
    return "The planner returned a response we couldn’t safely use this time.";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("slow")
  ) {
    return "The planner took too long to respond, so we stopped before changing anything.";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return "The planner is busy right now, so it couldn’t finish your request yet.";
  }

  if (
    normalized.includes("unavailable") ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("500") ||
    normalized.includes("503")
  ) {
    return "The planner ran into a temporary problem, so nothing was changed.";
  }

  return "The planner hit a temporary issue, and your tasks were left exactly as they were.";
}

function getFallbackReasonCopy(aiStatus, aiError) {
  if (typeof aiStatus === "string" && aiStatus.startsWith("fallback:")) {
    const rawReason = aiStatus.slice("fallback:".length).replace(/[-_]+/g, " ").trim();

    if (!rawReason) {
      return "The full AI path wasn’t available, so the planner used its safer backup path instead.";
    }

    return `${humanizePlannerReason(rawReason)} A safer backup path was used instead.`;
  }

  return humanizePlannerReason(aiError);
}

const PHASE_CONTENT = {
  "idle-no-queue": {
    label: "Waiting for your Next 3",
    hint: "Fill your queue first so the planner has something concrete to review.",
    detail: "Once 3 tasks are loaded, AI can suggest cleaner titles, subtasks, and automation ideas without changing anything automatically.",
    icon: "○",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
  idle: {
    label: "Ready when you are",
    hint: "Tap \"Refine these 3 with AI\" to review suggestions before anything changes.",
    detail: "The planner only works on your current Next 3, and every suggestion stays in review until you approve it.",
    icon: "○",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
  loading: {
    label: "Reviewing your Next 3…",
    hint: "The planner is checking your current queue and drafting suggestions. This usually takes a few seconds.",
    detail: "If AI is slow or unavailable, the planner falls back safely and your existing tasks stay exactly the same until you approve something.",
    icon: "◌",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
  fallback: {
    label: "Safe fallback used",
    hint: "The planner still returned a reviewable result, even though the full AI path was unavailable.",
    detail: "You can review or dismiss the suggestions below with the same approval guardrails. Nothing was applied automatically.",
    icon: "◇",
    color: "#92400e",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  error: {
    label: "Couldn’t load suggestions",
    hint: "You can try again safely — nothing was changed.",
    detail: "If this keeps happening, your queue is still intact and you can continue working without the planner.",
    icon: "△",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  review: {
    label: "Suggestions ready — review below",
    hint: "Approve a suggestion to apply it, or dismiss to skip.",
    detail: "Nothing changes unless you say so, and dismissing suggestions leaves your current plan untouched.",
    icon: "●",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
  done: {
    label: "All suggestions reviewed",
    hint: "You’re up to date. Refine again anytime to get a fresh pass.",
    detail: "Your latest review is complete, and your tasks only reflect the changes you explicitly approved.",
    icon: "✓",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
};

export default function AiPlannerGuidance({
  aiLoading,
  aiError,
  aiStatus,
  aiSuggestions,
  queueReady,
}) {
  const phase = getPhase({ aiLoading, aiError, aiStatus, aiSuggestions, queueReady });
  const content = PHASE_CONTENT[phase];
  const reasonCopy = getFallbackReasonCopy(aiStatus, aiError);
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
        {content.detail && (
          <div style={{ color: "#6b7280", marginTop: 4 }}>{content.detail}</div>
        )}
        {(phase === "fallback" || phase === "error") && reasonCopy && (
          <div style={{ color: "#6b7280", marginTop: 4 }}>
            <span style={{ fontWeight: 600, color: content.color }}>What happened:</span>{" "}
            {reasonCopy}
          </div>
        )}
      </div>
    </div>
  );
}
