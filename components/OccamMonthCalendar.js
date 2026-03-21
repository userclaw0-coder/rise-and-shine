/**
 * Month grid: logged lifts per day, today highlight, next Occam eligibility hint.
 */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function padMonthCell(isoDay, idx, setsByDate, todayStr, nextEligibleDateStr) {
  if (!isoDay)
    return <div key={`empty-${idx}`} className="rs-occam-cal__cell rs-occam-cal__cell--empty" />;
  const rows = setsByDate.get(isoDay) || [];
  const names = [...new Set(rows.map((r) => (r.exercise || "").trim()).filter(Boolean))];
  const summary = names.length ? names.slice(0, 2).join(" · ") : "";
  const more = names.length > 2 ? ` +${names.length - 2}` : "";
  const isToday = isoDay === todayStr;
  const isNext = nextEligibleDateStr && isoDay === nextEligibleDateStr;

  return (
    <div
      key={`day-${isoDay}`}
      className={`rs-occam-cal__cell${isToday ? " rs-occam-cal__cell--today" : ""}${
        isNext ? " rs-occam-cal__cell--next" : ""
      }`}
    >
      <span className="rs-occam-cal__daynum">{Number(isoDay.slice(8, 10))}</span>
      {summary ? (
        <span className="rs-occam-cal__log" title={names.join(", ")}>
          {summary}
          {more}
        </span>
      ) : (
        <span className="rs-occam-cal__log rs-occam-cal__log--muted">—</span>
      )}
    </div>
  );
}

export default function OccamMonthCalendar({
  year,
  monthIndex,
  onPrevMonth,
  onNextMonth,
  todayStr,
  setsByDate,
  nextEligibleDateStr,
}) {
  const first = new Date(year, monthIndex, 1);
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const startPad = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startPad; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const m = String(monthIndex + 1).padStart(2, "0");
    const day = String(d).padStart(2, "0");
    cells.push(`${year}-${m}-${day}`);
  }

  return (
    <section className="rs-section-card rs-occam-cal">
      <div className="rs-occam-cal__head">
        <button type="button" className="rs-occam-cal__nav" onClick={onPrevMonth} aria-label="Previous month">
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h2 className="rs-section-card__title" style={{ margin: 0, fontSize: "1.05rem" }}>
          {label}
        </h2>
        <button type="button" className="rs-occam-cal__nav" onClick={onNextMonth} aria-label="Next month">
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
      <p className="rs-section-card__subtitle" style={{ marginBottom: 10 }}>
        Logged exercises per day · Gold ring = today · Olive outline = next heavy session eligible
      </p>
      <div className="rs-occam-cal__dow">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="rs-occam-cal__dow-cell">
            {w}
          </span>
        ))}
      </div>
      <div className="rs-occam-cal__grid">
        {cells.map((iso, idx) => padMonthCell(iso, idx, setsByDate, todayStr, nextEligibleDateStr))}
      </div>
    </section>
  );
}
