import { getOutcomeLabel, getCategoryForTask } from "../lib/scoring";

function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
          {completed} of {total} completed
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 999,
            background: completed === total && total > 0 ? "#059669" : "#3b82f6",
            transition: "width 0.3s ease",
          }}
        />
      </div>
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

export default function ProgressToOutcome({ queueEntries, completionMap }) {
  if (!queueEntries || queueEntries.length === 0) return null;

  const total = queueEntries.length;
  const completed = queueEntries.filter(
    (e) => !!completionMap[e.task?.id]
  ).length;

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

  const allDone = completed === total;

  return (
    <section
      style={{
        marginBottom: 20,
        padding: 16,
        background: "#ffffff",
        borderRadius: 16,
        border: `1px solid ${allDone ? "#86efac" : "#e5e7eb"}`,
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
        {allDone ? "All actions complete" : "Today\u2019s Progress"}
      </h2>
      <p
        style={{
          margin: "0 0 12px",
          fontSize: 13,
          color: "#6b7280",
        }}
      >
        {allDone
          ? "Queue ready to refill with your next set of actions."
          : "How your current actions connect to bigger outcomes."}
      </p>

      <ProgressBar completed={completed} total={total} />

      {categories.size > 0 && (
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
      )}

      {categories.size === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          Assign categories to your tasks to see which outcomes they advance.
        </p>
      )}
    </section>
  );
}
