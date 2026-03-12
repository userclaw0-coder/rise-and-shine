import { getOutcomeLabel, getCategoryForTask } from "../lib/scoring";

const EXPECTED_ACTIONS = 3;
const MAX_SCALE = 10;

/**
 * Bar 1: Daily Hits (template tasks) — grey background, fill = completed.
 * Bar 2: Today's 3 Actions (all other completions today) — expected 3, blue fill then gold overflow.
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
  const actionsBluePct =
    actionsScale > 0
      ? (Math.min(EXPECTED_ACTIONS, otherCompletedToday) / actionsScale) * 100
      : 0;
  const actionsGoldPct = actionsFillPct - actionsBluePct;

  const queueTotal = queueEntries?.length ?? 0;
  const queueCompleted =
    queueEntries?.filter((e) => !!completionMap[e.task?.id]).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
            Daily Hits
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {dailyHitsCompleted} of {dailyHitsTotal} completed
          </span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${dailyHitsPct}%`,
              borderRadius: 999,
              background:
                dailyHitsCompleted === dailyHitsTotal && dailyHitsTotal > 0
                  ? "#059669"
                  : "#3b82f6",
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
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
            Today&apos;s 3 Actions
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {otherCompletedToday} of {EXPECTED_ACTIONS}+
            {otherCompletedToday > EXPECTED_ACTIONS && (
              <span style={{ color: "#b45309", marginLeft: 4 }}>
                · exceeding goal
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: "#e5e7eb",
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
              width: `${actionsBluePct}%`,
              borderRadius: "999px 0 0 999px",
              background: "#3b82f6",
              transition: "width 0.3s ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${actionsBluePct}%`,
              top: 0,
              bottom: 0,
              width: `${actionsGoldPct}%`,
              background: "#b45309",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {queueTotal > 0 && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: -4 }}>
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
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${allDone ? "#86efac" : "#e5e7eb"}`,
        background: allDone ? "#f0fdf4" : "#f9fafb",
        fontSize: 12,
        color: allDone ? "#059669" : "#374151",
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontWeight: 500 }}>{category}</span>
      <span style={{ color: "#9ca3af" }}>·</span>
      <span style={{ color: allDone ? "#059669" : "#6b7280" }}>
        {outcomeLabel}
      </span>
      <span
        style={{
          fontSize: 11,
          color: allDone ? "#059669" : "#9ca3af",
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
      style={{
        marginBottom: 20,
        padding: 16,
        background: "#ffffff",
        borderRadius: 16,
        border: `1px solid ${allQueueDone ? "#86efac" : "#e5e7eb"}`,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          margin: "0 0 4px",
        }}
      >
        {allQueueDone ? "All actions complete" : "Today's Progress"}
      </h2>
      <p
        style={{
          margin: "0 0 12px",
          fontSize: 13,
          color: "#6b7280",
        }}
      >
        {allQueueDone
          ? 'Great work! Hit "Refresh queue" below to get your next 3 actions.'
          : "Daily Hits (template) and today's actions from your queue or Action Items. Beyond 3 actions turns gold."}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
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
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "12px 0 0" }}>
            Assign categories to your tasks to see which outcomes they advance.
          </p>
        );
      })()}
    </section>
  );
}
