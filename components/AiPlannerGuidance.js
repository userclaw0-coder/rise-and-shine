// Packet 63: AI Planner re-entry decision bundle — when to keep working, quick revisit, or full rerun; lightest next step
// Packet 65: AI Planner post-apply confidence bundle — what stayed the same, planner can wait, trustworthy at a glance
// Packet 66: AI Planner keep-moving-without-recheck bundle — one coherent treatment: next-step momentum, planner-can-wait, revisit threshold
// Packet 67: AI Planner progress-without-recheck bundle — progress loop: keep-going cues, revisit triggers, quick progress-check orientation
// Packet 68: AI Planner progress-check and re-entry bundle — compact progress cues, continue-vs-pause confidence, clearer re-entry thresholds; one-glance after-apply loop
const KEEP_MOVING_LEAD =
  "Keep moving — no need to recheck the planner now. Your best next step is clear; the planner can wait.";
const APPLIED_KEEP_WORKING =
  "Keep working: your best move is from the updated plan. Pick the next task in your queue and keep going — no need to review every remaining suggestion or run Refine again. Lightest step: work your Next 3.";
const APPLIED_QUICK_REVISIT =
  "Quick revisit: if one remaining suggestion clearly helps, a quick look on a short break later today is enough. The rest can wait until another day — you don't need to clear every card today. Lightest step: optionally peek at one suggestion later, or ignore.";
const APPLIED_WHEN_FULL_RERUN_WORTH_IT =
  "When a full planner run is worth it: run \"Refine these 3 with AI\" when you've done a chunk of work, your Next 3 has changed, or you want a fresh set. Right after one apply, another run is unnecessary — your plan is already updated; reopening the planner now would be an interruption. Lightest step: don't run Refine now.";
const APPLIED_STAY_IN_MOTION =
  "Stay in motion: your queue is updated. Work your Next 3; the planner is there whenever you want another pass, but you don't need one to keep today moving — so you can keep going without feeling trapped in repeated planner loops.";
// Packet 67: progress loop — how to tell you're still on track without reopening
const PROGRESS_CHECK_ORIENTATION =
  "You're still on track if you're working from your updated Next 3, you've applied one change and are doing the next task, and nothing has made your plan feel wrong. No need to reopen the planner to verify — your queue is updated and today is moving.";
const PROGRESS_SIGNALS_KEEP_GOING =
  "Keep going when: you're working your Next 3; you know your next task; you're not stuck.";
const PROGRESS_SIGNALS_REVISIT_LATER =
  "Consider a quick revisit later when: one remaining suggestion clearly helps and you have a short break; you've done a chunk and want to peek at one more. Right now, keep going.";
const REVISIT_TRIGGERS_WORTH_IT =
  "Revisit is worth it when: you've done a chunk of work and one remaining suggestion still fits; your Next 3 has changed and you want a fresh set; you're on a short break and one suggestion would help.";
const REVISIT_TRIGGERS_NOT_NEEDED =
  "Revisit is not needed when: you just applied one suggestion; you're still working through your current Next 3; today is moving and you're not stuck — no pressure to rerun.";

// Packet 68: compact one-glance progress loop — progress cues, continue-vs-pause confidence, re-entry threshold
const PROGRESS_CUES_COMPACT =
  "Still progressing today: working from your Next 3, next task is clear, plan still feels right.";
const CONTINUE_OR_PAUSE_COMPACT =
  "Continue or pause: safe to keep working or take a short break — no planner churn; your updated plan stays trustworthy.";
const REVISIT_THRESHOLD_COMPACT =
  "Revisit worth it: after a chunk of work, or one remaining suggestion clearly helps on a short break. Not now: you just applied; keep going.";
const FULL_RERUN_UNNECESSARY_COMPACT =
  "Full rerun unnecessary now: plan is updated and trustworthy; run Refine again when you want a fresh set, not to verify progress.";

// Packet 64: Updated plan recap bundle — what changed, what to do now, when safe to ignore
const RECAP_WHAT_CHANGED_FALLBACK =
  "One suggestion was applied; your plan is updated.";
const RECAP_DO_NOW =
  "Your best move is from the updated plan: work your Next 3. No need to review every remaining suggestion or run Refine again.";
const RECAP_SAFE_TO_IGNORE =
  "You can close this and keep working — no need to reopen the planner until you've done a chunk of work, your Next 3 has changed, or you want a fresh set. Right now, another run would be an interruption.";
const RECAP_WHEN_REVISIT_WORTH_IT =
  "Revisit later today only if one remaining suggestion clearly helps; otherwise keep moving. Run \"Refine these 3 with AI\" when you want a fresh pass — not required to keep today moving.";

// Packet 65: Post-apply confidence bundle — what stayed the same, planner can wait
const RECAP_WHAT_STAYED_SAME =
  "Only the item you approved was updated; your queue order, other tasks, and any unapproved suggestions are unchanged — stable enough to trust.";
const RECAP_PLANNER_CAN_WAIT =
  "The planner can safely stay out of the way: close this and keep working. You don't need to reopen it until you've done a chunk of work, your Next 3 has changed, or you want a fresh set.";

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
    detail: "Nothing is applied in bulk or automatically. Your current plan stays unchanged until you approve a specific suggestion, and dismissing only hides a card without changing any tasks.",
    readinessBundle: {
      whatChanges:
        "Approving one suggestion only updates that single item (one task title, one subtask set, or one automation idea) right away. You can always refine again later for a fresh pass.",
      whatStaysUntouched:
        "Every other suggestion stays in review until you approve it. There is no bulk apply — your queue and tasks stay as they are except for the ones you explicitly approve. Dismissing or skipping a card simply removes that suggestion from view; your underlying tasks and queue stay exactly as they are.",
      whyNow:
        "This set was built for your current Next 3 and is ready for a quick one-at-a-time pass. You can do one approval and stop, or work through as many as you like.",
      nextStep:
        "Quickest low-risk move: scan the list below, approve one suggestion that clearly helps, or dismiss and keep working your queue as-is. You can safely ignore anything that feels off and ask for a new set later.",
    },
    continuityBundle: {
      afterApprove:
        "Right after you approve one suggestion, that change is applied and the card goes away. You can approve another, or stop here and work your queue — no need to review everything.",
      afterDismiss:
        "After you dismiss one, that suggestion is removed from view and your tasks are unchanged. You can dismiss more, approve another, or simply continue with your current plan.",
      oneStep:
        "One small move is enough: approve one or dismiss one, then continue. You’re not expected to do a full pass — the planner stays steady either way.",
      momentum:
        "Staying steady: one approval or one dismiss keeps momentum. You can leave the rest for later or run \"Refine these 3 with AI\" again anytime for a fresh set.",
    },
    // Packet 63: re-entry decision bundle — keep working, quick revisit, full rerun, stay in motion
    // Packet 64: updated plan recap — what changed, do now, safe to ignore, when revisit worth it
    // Packet 65: post-apply confidence — what stayed the same, planner can wait
    // Packet 66: keep-moving bundle — one coherent action-ready treatment
    // Packet 67: progress loop — progress-check orientation, keep-going vs revisit signals, concrete revisit triggers
    // Packet 68: progress-check and re-entry bundle — compact one-glance loop
    appliedStateBundle: {
      keepMovingLead: KEEP_MOVING_LEAD,
      title: "Updated plan recap",
      confidenceHeadline: "Your plan is updated and trustworthy at a glance.",
      recapWhatChangedFallback: RECAP_WHAT_CHANGED_FALLBACK,
      recapWhatStayedSame: RECAP_WHAT_STAYED_SAME,
      recapDoNow: RECAP_DO_NOW,
      recapPlannerCanWait: RECAP_PLANNER_CAN_WAIT,
      recapSafeToIgnore: RECAP_SAFE_TO_IGNORE,
      recapWhenRevisitWorthIt: RECAP_WHEN_REVISIT_WORTH_IT,
      reEntryTitle: "Re-entry: your next move",
      keepWorking: APPLIED_KEEP_WORKING,
      quickRevisit: APPLIED_QUICK_REVISIT,
      whenFullRerunWorthIt: APPLIED_WHEN_FULL_RERUN_WORTH_IT,
      stayInMotion: APPLIED_STAY_IN_MOTION,
      progressCheckOrientation: PROGRESS_CHECK_ORIENTATION,
      progressSignalsKeepGoing: PROGRESS_SIGNALS_KEEP_GOING,
      progressSignalsRevisitLater: PROGRESS_SIGNALS_REVISIT_LATER,
      revisitTriggersWorthIt: REVISIT_TRIGGERS_WORTH_IT,
      revisitTriggersNotNeeded: REVISIT_TRIGGERS_NOT_NEEDED,
      // Packet 68: compact one-glance
      progressCuesCompact: PROGRESS_CUES_COMPACT,
      continueOrPauseCompact: CONTINUE_OR_PAUSE_COMPACT,
      revisitThresholdCompact: REVISIT_THRESHOLD_COMPACT,
      fullRerunUnnecessaryCompact: FULL_RERUN_UNNECESSARY_COMPACT,
    },
    icon: "●",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
  empty: {
    label: "No new suggestions this pass",
    hint: "That can be a good result — it usually means your current Next 3 already looks clear enough to keep moving.",
    detail:
      "This is different from an error: the planner finished safely, found nothing worth changing, and left your tasks exactly as they were. Work your queue as-is, or run \"Refine these 3 with AI\" again anytime for a fresh set.",
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

function isAppliedSuccessMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  return !msg.trim().toLowerCase().includes("failed");
}

export default function AiPlannerGuidance({
  aiLoading,
  aiError,
  aiStatus,
  aiSuggestions,
  queueReady,
  appliedMessage,
  appliedSuccessVisible = false,
}) {
  const phase = getPhase({ aiLoading, aiError, aiStatus, aiSuggestions, queueReady });
  const content = PHASE_CONTENT[phase];
  const reasonCopy = getFallbackReasonCopy(aiStatus, aiError);
  const reviewSummary = getReviewSummary(aiSuggestions);
  const showAppliedState =
    phase === "review" &&
    content?.appliedStateBundle &&
    (appliedSuccessVisible || (appliedMessage && isAppliedSuccessMessage(appliedMessage)));
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
          {phase === "review" && content.continuityBundle && !showAppliedState && (
            <div
              role="region"
              aria-label="Post-review continuity"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#f0fdf4",
                border: "1px solid #86efac",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#065f46",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                What happens next — stay steady
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.continuityBundle.afterApprove}</li>
                <li style={{ marginBottom: 4 }}>{content.continuityBundle.afterDismiss}</li>
                <li style={{ marginBottom: 4 }}>{content.continuityBundle.oneStep}</li>
                <li style={{ marginBottom: 0 }}>{content.continuityBundle.momentum}</li>
              </ol>
            </div>
          )}
          {showAppliedState && content.appliedStateBundle && (
            <div
              role="region"
              aria-label="Keep moving: progress check, continue or pause, revisit threshold, when to keep working or rerun"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#ecfdf5",
                border: "1px solid #10b981",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#065f46",
              }}
            >
              {content.appliedStateBundle.keepMovingLead && (
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#047857" }}>
                  {content.appliedStateBundle.keepMovingLead}
                </div>
              )}
              {/* Packet 68: one-glance progress loop — compact cues, continue-vs-pause confidence, re-entry threshold */}
              <div
                style={{
                  marginBottom: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "#d1fae5",
                  border: "1px solid #6ee7b7",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, color: "#047857", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                  Progress loop at a glance
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc" }}>
                  <li style={{ marginBottom: 4 }}>{content.appliedStateBundle.progressCuesCompact}</li>
                  <li style={{ marginBottom: 4 }}>{content.appliedStateBundle.continueOrPauseCompact}</li>
                  <li style={{ marginBottom: 4 }}>{content.appliedStateBundle.revisitThresholdCompact}</li>
                  <li style={{ marginBottom: 0 }}>{content.appliedStateBundle.fullRerunUnnecessaryCompact}</li>
                </ul>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                Best next move
              </div>
              <div style={{ marginBottom: 6 }}>
                {content.appliedStateBundle.recapDoNow}
              </div>
              {reviewSummary && reviewSummary.total > 0 && (
                <div style={{ marginBottom: 6, color: "#047857" }}>
                  <span style={{ fontWeight: 600 }}>Remaining:</span>{" "}
                  {reviewSummary.total} suggestion{reviewSummary.total === 1 ? "" : "s"} ·{" "}
                  {reviewSummary.items.join(" · ")}. Quick peek later if one helps; the rest can wait.
                </div>
              )}
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                When a full rerun is worth it (right now it isn’t)
              </div>
              <div style={{ marginBottom: 8 }}>
                {content.appliedStateBundle.recapSafeToIgnore}
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "#047857" }}>What changed:</span>{" "}
                {appliedMessage && isAppliedSuccessMessage(appliedMessage)
                  ? appliedMessage.trim()
                  : content.appliedStateBundle.recapWhatChangedFallback}
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: "#047857" }}>What stayed the same:</span>{" "}
                {content.appliedStateBundle.recapWhatStayedSame}
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                {content.appliedStateBundle.reEntryTitle}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.appliedStateBundle.keepWorking}</li>
                <li style={{ marginBottom: 4 }}>{content.appliedStateBundle.quickRevisit}</li>
                <li style={{ marginBottom: 4 }}>{content.appliedStateBundle.whenFullRerunWorthIt}</li>
                <li style={{ marginBottom: 0 }}>{content.appliedStateBundle.stayInMotion}</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
