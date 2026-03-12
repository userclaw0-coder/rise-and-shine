import { getOutcomeLabel, getCategoryForTask } from "../lib/scoring";

const EXPECTED_DAILY = 3;
const MAX_SCALE = 10;

/**
 * Two bars, same pixel width. Left: daily outcomes (expected = 3, actual fills; overflow in gold).
 * Right: Next 3 Actions (3 total, fill = completed in current queue).
 * Scales so the daily bar doesn't grow off the page (cap at MAX_SCALE).
 */
function DualProgressBars({
  dailyCompletedToday,
  queueEntries,
  completionMap,
}) {
  const queueTotal = queueEntries?.length ?? 0;
  const queueCompleted =
    queueEntries?.filter((e) => !!completionMap[e.task?.id]).length ?? 0;

  const dailyScale = Math.min(
    MAX_SCALE,
    Math.max(EXPECTED_DAILY, dailyCompletedToday)
  );
  const dailyFillPct = dailyScale > 0 ? (dailyCompletedToday / dailyScale) * 100 : 0;
  const dailyBluePct =
    dailyScale > 0
      ? (Math.min(EXPECTED_DAILY, dailyCompletedToday) / dailyScale) * 100
      : 0;
  const dailyGoldPct = dailyFillPct - dailyBluePct;

  const next3FillPct = queueTotal > 0 ? (queueCompleted / queueTotal) * 100 : 0;

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
            Daily outcomes
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {dailyCompletedToday} of {EXPECTED_DAILY}+
            {dailyCompletedToday > EXPECTED_DAILY && (
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
              width: `${dailyBluePct}%`,
              borderRadius: "999px 0 0 999px",
              background: "#3b82f6",
              transition: "width 0.3s ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${dailyBluePct}%`,
              top: 0,
              bottom: 0,
              width: `${dailyGoldPct}%`,
              background: "#b45309",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {queueTotal > 0 && (
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
              Next {queueTotal} actions
            </span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {queueCompleted} of {queueTotal} completed
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
                width: `${next3FillPct}%`,
                borderRadius: 999,
                background:
                  queueCompleted === queueTotal && queueTotal > 0
                    ? "#059669"
                    : "#3b82f6",
                transition: "width 0.3s ease",
              }}
            />
          </div>
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
  dailyCompletedToday = 0,
}) {
  if (!queueEntries || queueEntries.length === 0) {
    return (
      <section
        style={{
          marginBottom: 20,
          padding: 16,
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
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
          Today&apos;s Progress
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
          Complete tasks from your Next 3 or Action Items to fill the bars.
        </p>
        <DualProgressBars
          dailyCompletedToday={dailyCompletedToday}
          queueEntries={[]}
          completionMap={completionMap}
        />
      </section>
    );
  }

  const queueCompleted = queueEntries.filter(
    (e) => !!completionMap[e.task?.id]
  ).length;
  const queueTotal = queueEntries.length;
  const allQueueDone = queueCompleted === queueTotal;

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
          : "Daily outcomes (any task) and your current Next 3. Beyond 3 turns gold."}
      </p>

      <DualProgressBars
        dailyCompletedToday={dailyCompletedToday}
        queueEntries={queueEntries}
        completionMap={completionMap}
      />

      {categories.size > 0 && (
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
      )}

      {categories.size === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "12px 0 0" }}>
          Assign categories to your tasks to see which outcomes they advance.
        </p>
      )}
    </section>
  );
}
