export default function SectionCard({ title, subtitle, children }) {
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
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
