import { getOutcomeLabel, getCategoryForTask } from "../lib/scoring";

const EXPECTED_ACTIONS = 3;
const MAX_SCALE = 10;

/**
 * Bar 1: Daily Hits — gold gradient fill.
 * Bar 2: Today's actions — olive to goal, gold overflow.
 */
function DualProgressBars({
  dailyHitsTotal,
  dailyHitsCompleted,
  otherCompletedToday,
  queueEntries,
  completionMap,
}) {
  const dailyHitsPct =
    dailyHitsTotal > 0 ? (dailyHitsCompleted / dailyHitsTotal) * 100 : 0;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--rs-on-surface-variant)",
            }}
          >
            Daily Hits
          </span>
          <span style={{ fontSize: 12, color: "var(--rs-on-surface-variant)" }}>
            {dailyHitsCompleted} of {dailyHitsTotal} completed
          </span>
        </div>
        <div className="rs-momentum__track" style={{ height: 10 }}>
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

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--rs-on-surface-variant)",
            }}
          >
            Today&apos;s actions
          </span>
          <span style={{ fontSize: 12, color: "var(--rs-on-surface-variant)" }}>
            {otherCompletedToday} of {EXPECTED_ACTIONS}+
            {otherCompletedToday > EXPECTED_ACTIONS && (
              <span style={{ color: "var(--rs-accent-gold)", marginLeft: 4, fontWeight: 600 }}>
                · exceeding goal
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: "var(--rs-radius-full)",
            background: "rgba(186, 177, 159, 0.2)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${actionsOlivePct}%`,
              borderRadius: "999px 0 0 999px",
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
      </div>

      {queueTotal > 0 && (
        <div style={{ fontSize: 12, color: "var(--rs-on-surface-variant)", marginTop: -8 }}>
          Current queue: {queueCompleted} of {queueTotal} completed
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
      className="rs-section-card"
      style={{
        marginBottom: "var(--rs-space-5)",
        borderColor: allQueueDone ? "rgba(85, 93, 30, 0.22)" : undefined,
        boxShadow: allQueueDone ? "0 12px 32px rgba(85, 93, 30, 0.08)" : undefined,
      }}
    >
      <h2 className="rs-section-card__title" style={{ marginBottom: 4 }}>
        {allQueueDone ? "All actions complete" : "Today's progress"}
      </h2>
      <p className="rs-section-card__subtitle" style={{ marginBottom: 14 }}>
        {allQueueDone
          ? 'Great work! Tap "Refresh queue" to load your next three actions.'
          : "Daily Hits and everything else you complete today. Beyond three actions, momentum shows in gold."}
      </p>

      <DualProgressBars
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
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
