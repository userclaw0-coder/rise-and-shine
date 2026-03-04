function FragmentRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </>
  );
}

export default function OutcomeExplanation({ breakdown }) {
  if (!breakdown) return null;
  const rows = [
    ["Priority score", breakdown.priorityScore],
    [
      "Category (base+mode)×8",
      `${breakdown.baseCategory}+${breakdown.modeAdjustment} → ${breakdown.categoryComponent}`,
    ],
    ["Tag boost", breakdown.tagBoost || 0],
    ["Staleness", breakdown.stalenessComponent ?? 0],
    ["Subtask boost", breakdown.subtaskComponent ?? 0],
    ["Effort penalty", breakdown.effortPenalty ?? 0],
  ];
  return (
    <dl
      style={{
        marginTop: 6,
        fontSize: 12,
        color: "#6b7280",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        rowGap: 2,
        columnGap: 12,
      }}
    >
      {rows.map(([label, value]) => (
        <FragmentRow key={label} label={label} value={value} />
      ))}
    </dl>
  );
}
