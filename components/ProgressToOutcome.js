import { getOutcomeLabel, getCategoryForTask } from "../lib/scoring";

const EXPECTED_ACTIONS = 3;
const MAX_SCALE = 10;

/**
 * Two metric cards: Daily Hits + Today's actions (side-by-side on wide screens).
 * Gold / olive gradients aligned with site theme.
 */
function ProgressMetricsGrid({
  dailyHitsTotal,
  dailyHitsCompleted,
  otherCompletedToday,
  queueEntries,
  completionMap,
}) {
  const dailyHitsPct =
    dailyHitsTotal > 0 ? (dailyHitsCompleted / dailyHitsTotal) * 100 : 0;
  const dailyMomentumPct =
    dailyHitsTotal > 0 ? Math.round((dailyHitsCompleted / dailyHitsTotal) * 100) : 0;

  const actionsScale = Math.min(
    MAX_SCALE,
    Math.max(EXPECTED_ACTIONS, otherCompletedToday)
  );
  const actionsFillPct =
    actionsScale > 0 ? (otherCompletedToday / actionsScale) * 100 : 0;
  const actionsOlivePct =
    actionsScale > 0
      ? (Math.min(EXPECTED_ACTIONS, otherCompletedToday) / actionsScale) * 100
      : 0;
  const actionsGoldPct = actionsFillPct - actionsOlivePct;

  const queueTotal = queueEntries?.length ?? 0;
  const queueCompleted =
    queueEntries?.filter((e) => !!completionMap[e.task?.id]).length ?? 0;

  const hitsComplete =
    dailyHitsTotal > 0 && dailyHitsCompleted === dailyHitsTotal;

  return (
    <div className="rs-progress-metrics-grid">
      <div className="rs-progress-metric-card">
        <div className="rs-progress-metric-card__accent" aria-hidden />
        <div className="rs-progress-metric-card__head">
          <span className="rs-progress-metric-card__icon" aria-hidden>
            <span className="material-symbols-outlined">checklist</span>
          </span>
          <div className="rs-progress-metric-card__titles">
            <span className="rs-progress-metric-card__label">Daily Hits</span>
            <span className="rs-progress-metric-card__stat">
              {dailyHitsCompleted}
              <span className="rs-progress-metric-card__stat-dim">/{dailyHitsTotal || "—"}</span>
            </span>
          </div>
        </div>
        <div className="rs-progress-metric-card__ring-wrap" aria-hidden>
          <svg className="rs-progress-metric-card__ring" viewBox="0 0 72 72">
            <circle
              className="rs-progress-metric-card__ring-bg"
              cx="36"
              cy="36"
              r="30"
              fill="none"
              strokeWidth="6"
            />
            <circle
              className="rs-progress-metric-card__ring-fill"
              cx="36"
              cy="36"
              r="30"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(dailyMomentumPct / 100) * 188.5} 188.5`}
              transform="rotate(-90 36 36)"
            />
          </svg>
          <span className="rs-progress-metric-card__ring-pct">{dailyMomentumPct}%</span>
        </div>
        <p className="rs-progress-metric-card__caption">
          {(dailyHitsTotal ?? 0) === 0
            ? "Add rituals on Daily Hits to track consistency."
            : hitsComplete
              ? "Morning rhythm locked in."
              : "Rituals complete today."}
        </p>
        <div className="rs-momentum__track rs-progress-metric-card__bar" style={{ height: 8 }}>
          <div
            style={{
              height: "100%",
              width: `${dailyHitsPct}%`,
              borderRadius: "var(--rs-radius-full)",
              background: hitsComplete
                ? "linear-gradient(90deg, var(--rs-olive) 0%, #6b7530 100%)"
                : "linear-gradient(90deg, var(--rs-primary-strong) 0%, var(--rs-accent-gold) 55%, var(--rs-primary-glow) 100%)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      <div className="rs-progress-metric-card rs-progress-metric-card--actions">
        <div className="rs-progress-metric-card__accent rs-progress-metric-card__accent--olive" aria-hidden />
        <div className="rs-progress-metric-card__head">
          <span className="rs-progress-metric-card__icon rs-progress-metric-card__icon--olive" aria-hidden>
            <span className="material-symbols-outlined">bolt</span>
          </span>
          <div className="rs-progress-metric-card__titles">
            <span className="rs-progress-metric-card__label">Today&apos;s actions</span>
            <span className="rs-progress-metric-card__stat">
              {otherCompletedToday}
              <span className="rs-progress-metric-card__stat-dim">/{EXPECTED_ACTIONS}+</span>
            </span>
          </div>
        </div>
        {otherCompletedToday > EXPECTED_ACTIONS && (
          <p className="rs-progress-metric-card__overflow">
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, verticalAlign: "middle" }}>
              trending_up
            </span>{" "}
            Exceeding goal — gold shows overflow
          </p>
        )}
        <div
          className="rs-progress-metric-card__actions-track"
          role="progressbar"
          aria-valuenow={otherCompletedToday}
          aria-valuemin={0}
          aria-valuemax={actionsScale}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${actionsOlivePct}%`,
              borderRadius: "var(--rs-radius-full) 0 0 var(--rs-radius-full)",
              background: "linear-gradient(90deg, var(--rs-olive) 0%, #6b7530 100%)",
              transition: "width 0.3s ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${actionsOlivePct}%`,
              top: 0,
              bottom: 0,
              width: `${actionsGoldPct}%`,
              background:
                "linear-gradient(90deg, var(--rs-primary-strong) 0%, var(--rs-primary-glow) 100%)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <p className="rs-progress-metric-card__caption">
          Olive = first three completions · Gold = momentum beyond
        </p>
      </div>

      {queueTotal > 0 && (
        <div className="rs-progress-queue-foot">
          <span className="material-symbols-outlined" aria-hidden>
            deployed_code
          </span>
          <span>
            Current queue: <strong>{queueCompleted}</strong> of {queueTotal} completed
          </span>
        </div>
      )}
    </div>
  );
}

function OutcomePill({ category, outcomeLabel, done, total }) {
  const allDone = done === total;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: "var(--rs-radius-full)",
        border: `1px solid ${
          allDone ? "rgba(85, 93, 30, 0.35)" : "rgba(186, 177, 159, 0.22)"
        }`,
        background: allDone ? "rgba(85, 93, 30, 0.08)" : "var(--rs-surface-low)",
        fontSize: 12,
        color: allDone ? "var(--rs-olive)" : "var(--rs-on-surface)",
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontWeight: 600 }}>{category}</span>
      <span style={{ color: "var(--rs-on-surface-variant)", opacity: 0.7 }}>·</span>
      <span style={{ color: "var(--rs-on-surface-variant)" }}>{outcomeLabel}</span>
      <span
        style={{
          fontSize: 11,
          color: allDone ? "var(--rs-olive)" : "var(--rs-on-surface-variant)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {done}/{total}
      </span>
    </div>
  );
}

export default function ProgressToOutcome({
  queueEntries,
  completionMap,
  dailyHitsTotal = 0,
  dailyHitsCompleted = 0,
  otherCompletedToday = 0,
}) {
  const hasQueue = queueEntries && queueEntries.length > 0;
  const queueCompleted = hasQueue
    ? queueEntries.filter((e) => !!completionMap[e.task?.id]).length
    : 0;
  const queueTotal = hasQueue ? queueEntries.length : 0;
  const allQueueDone = hasQueue && queueCompleted === queueTotal;

  return (
    <section
      className="rs-section-card rs-today-progress-panel"
      style={{
        marginBottom: 0,
        borderColor: allQueueDone ? "rgba(85, 93, 30, 0.22)" : undefined,
        boxShadow: allQueueDone ? "0 12px 32px rgba(85, 93, 30, 0.08)" : undefined,
      }}
    >
      <div className="rs-progress-section-head">
        <div className="rs-progress-section-head__mark" aria-hidden>
          <span className="material-symbols-outlined">wb_sunny</span>
        </div>
        <div className="rs-progress-section-head__text">
          <h2 className="rs-section-card__title" style={{ marginBottom: 4 }}>
            {allQueueDone ? "All actions complete" : "Today's progress"}
          </h2>
          <p className="rs-section-card__subtitle" style={{ marginBottom: 0 }}>
            {allQueueDone
              ? 'Great work! Tap "Refresh queue" to load your next three actions.'
              : "Daily Hits and everything else you finish today — momentum shows in gold."}
          </p>
        </div>
      </div>

      <ProgressMetricsGrid
        dailyHitsTotal={dailyHitsTotal}
        dailyHitsCompleted={dailyHitsCompleted}
        otherCompletedToday={otherCompletedToday}
        queueEntries={queueEntries || []}
        completionMap={completionMap}
      />

      {hasQueue && (() => {
        const categories = new Map();
        for (const entry of queueEntries) {
          const cat = getCategoryForTask(entry.task);
          if (!cat) continue;
          const isDone = !!completionMap[entry.task?.id];
          if (!categories.has(cat)) {
            categories.set(cat, { total: 0, done: 0 });
          }
          const c = categories.get(cat);
          c.total += 1;
          if (isDone) c.done += 1;
        }
        if (categories.size > 0) {
          return (
            <div className="rs-progress-outcome-row">
              <span className="rs-progress-outcome-row__label">
                <span className="material-symbols-outlined" aria-hidden>
                  track_changes
                </span>
                Queue by outcome
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Array.from(categories.entries()).map(([cat, counts]) => (
                  <OutcomePill
                    key={cat}
                    category={cat}
                    outcomeLabel={getOutcomeLabel(cat)}
                    done={counts.done}
                    total={counts.total}
                  />
                ))}
              </div>
            </div>
          );
        }
        return (
          <p style={{ fontSize: 12, color: "var(--rs-on-surface-variant)", margin: "14px 0 0" }}>
            Assign categories to your tasks to see which outcomes they advance.
          </p>
        );
      })()}
    </section>
  );
}
