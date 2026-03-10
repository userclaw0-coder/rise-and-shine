function getReviewSummary(aiSuggestions) {
  if (!aiSuggestions) return null;

  const categories = [
    {
      key: "task_refinements",
      singular: "task refinement",
      plural: "task refinements",
    },
    {
      key: "suggested_subtasks_to_create",
      singular: "subtask plan",
      plural: "subtask plans",
    },
    {
      key: "automation_opportunities",
      singular: "automation idea",
      plural: "automation ideas",
    },
  ];

  const items = categories
    .map(({ key, singular, plural }) => {
      const count = aiSuggestions[key]?.length || 0;
      if (!count) return null;
      return `${count} ${count === 1 ? singular : plural}`;
    })
    .filter(Boolean);

  if (items.length === 0) return null;

  const total = categories.reduce(
    (sum, { key }) => sum + (aiSuggestions[key]?.length || 0),
    0
  );

  return {
    total,
    items,
  };
}

function getPhase({ aiLoading, aiError, aiStatus, aiSuggestions, queueReady }) {
  if (aiLoading) return "loading";
  if (typeof aiStatus === "string" && aiStatus.startsWith("fallback:")) return "fallback";
  if (aiError && !aiSuggestions) return "error";

  if (aiSuggestions) {
    const total =
      (aiSuggestions.task_refinements?.length || 0) +
      (aiSuggestions.suggested_subtasks_to_create?.length || 0) +
      (aiSuggestions.automation_opportunities?.length || 0);
    return total > 0 ? "review" : "empty";
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
      return "The planner couldn’t complete the full AI pass this time, so it set up a quick backup review instead.";
    }

    return `${humanizePlannerReason(rawReason)} Instead of forcing a shaky result through, the planner set up a quick backup review.`;
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
    label: "Actively reviewing your Next 3…",
    hint: "The planner is working through your current queue right now and drafting suggestions. This usually takes a few seconds.",
    detail: "This is a review step only — nothing in your tasks changes while loading, and any suggestions still wait for your approval.",
    icon: "◌",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
  fallback: {
    label: "Backup path — you’re still in good shape",
    hint: "The full AI pass didn’t complete this time. A calm backup review is ready so you can still make progress.",
    detail: "Your tasks haven’t changed. You stay in control of if and when any single suggestion is applied.",
    trustBundle: {
      safety:
        "Each suggestion is optional and applied one at a time — approving one only updates that single task and leaves the rest exactly as they are.",
      useful:
        "Scan for a single suggestion that clearly helps your Next 3; approve just that one and ignore or dismiss anything that doesn’t feel useful.",
      resume:
        "If nothing feels right, keep working your current queue as-is and try another AI pass later — there’s no penalty for waiting.",
      nextStep:
        "Next step: either take one low-pressure tweak, or keep your existing plan and revisit suggestions when you have more energy.",
    },
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
    label: "Suggestions ready — optional review below",
    hint: "Each suggestion stands on its own: approve only the ones you want, or dismiss any you don’t.",
    detail: "Nothing is applied in bulk or automatically. Your current plan stays unchanged until you approve a specific suggestion.",
    readinessBundle: {
      whatChanges:
        "Approving one suggestion only updates that single item (one task title, one subtask set, or one automation idea). Nothing else in your plan changes.",
      whatStaysUntouched:
        "Every other suggestion stays in review until you approve it. There is no bulk apply — your queue and tasks stay as they are except for the ones you explicitly approve.",
      whyNow:
        "This set was built for your current Next 3 and is ready for a quick one-at-a-time pass. You can do one approval and stop, or work through as many as you like.",
      nextStep:
        "Quickest low-risk move: scan the list below, approve one suggestion that clearly helps, or dismiss and keep working your queue as-is. No need to do everything.",
    },
    icon: "●",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
  empty: {
    label: "No new suggestions this pass",
    hint: "That can be a good result — it usually means your current Next 3 already looks clear enough to keep moving.",
    detail: "This is different from an error: the planner finished safely, found nothing worth changing, and left your tasks exactly as they were.",
    icon: "✓",
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
  const reviewSummary = getReviewSummary(aiSuggestions);
  if (!content) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 8,
          background: content.bg,
          border: `1px solid ${content.border}`,
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
              <span style={{ fontWeight: 600, color: content.color }}>Details:</span>{" "}
              {reasonCopy}
            </div>
          )}
          {phase === "fallback" && content.trustBundle && (
            <div
              role="region"
              aria-label="Fallback action path"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#78350f",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#92400e" }}>
                Calm backup action path
              </div>
              {reviewSummary && (
                <div style={{ marginBottom: 6, color: "#6b7280" }}>
                  <span style={{ fontWeight: 600, color: "#92400e" }}>Suggestions on deck:</span>{" "}
                  {reviewSummary.total} suggestion{reviewSummary.total === 1 ? "" : "s"} ·{" "}
                  {reviewSummary.items.join(" · ")}. You can safely ignore them all or
                  approve just one that clearly helps.
                </div>
              )}
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.trustBundle.safety}</li>
                <li style={{ marginBottom: 4 }}>{content.trustBundle.useful}</li>
                <li style={{ marginBottom: 4 }}>{content.trustBundle.resume}</li>
                <li style={{ marginBottom: 0 }}>{content.trustBundle.nextStep}</li>
              </ol>
            </div>
          )}
          {phase === "review" && content.readinessBundle && (
            <div
              role="region"
              aria-label="Review readiness"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#d1fae5",
                border: "1px solid #6ee7b7",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#065f46",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                Review readiness — what to expect
              </div>
              {reviewSummary && (
                <div style={{ marginBottom: 6, color: "#047857" }}>
                  <span style={{ fontWeight: 600 }}>Suggestions on deck:</span>{" "}
                  {reviewSummary.total} suggestion{reviewSummary.total === 1 ? "" : "s"} ·{" "}
                  {reviewSummary.items.join(" · ")}. Worth a quick one-at-a-time pass.
                </div>
              )}
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.readinessBundle.whatChanges}</li>
                <li style={{ marginBottom: 4 }}>{content.readinessBundle.whatStaysUntouched}</li>
                <li style={{ marginBottom: 4 }}>{content.readinessBundle.whyNow}</li>
                <li style={{ marginBottom: 0 }}>{content.readinessBundle.nextStep}</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
