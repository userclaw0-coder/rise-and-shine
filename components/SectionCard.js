export default function SectionCard({ title, subtitle, children }) {
  return (
    <section className="rs-section-card">
      <div
        style={{
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <div>
          <h2 className="rs-section-card__title">{title}</h2>
          {subtitle && (
            <div className="rs-section-card__subtitle">{subtitle}</div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
