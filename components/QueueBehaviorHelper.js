import { useState } from "react";

export default function QueueBehaviorHelper() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        background: "#f0f9ff",
        borderRadius: 12,
        border: "1px solid #bae6fd",
        fontSize: 13,
        color: "#1e40af",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          fontWeight: 500,
          fontSize: 13,
          color: "#1e40af",
        }}
      >
        <span>How your queue works</span>
        <span style={{ fontSize: 11, color: "#60a5fa" }}>
          {expanded ? "Hide" : "Show"}
        </span>
      </button>
      {expanded && (
        <ul
          style={{
            margin: "8px 0 0",
            paddingLeft: 18,
            lineHeight: 1.7,
            color: "#1e3a5f",
          }}
        >
          <li>Your Next 3 stay locked until all three are completed.</li>
          <li>
            Completing all 3 automatically picks a fresh set based on your
            current mode.
          </li>
          <li>Use &ldquo;Refresh queue&rdquo; to manually reroll at any time.</li>
          <li>Tasks tagged blocked or waiting are skipped automatically.</li>
          <li>
            When AI subtasks are created, the most actionable one replaces its
            parent in the queue.
          </li>
        </ul>
      )}
    </div>
  );
}
