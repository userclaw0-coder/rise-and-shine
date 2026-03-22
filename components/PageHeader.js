/**
 * Editorial page chrome aligned with Stitch mockups (eyebrow + serif title + subtitle).
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  children,
}) {
  return (
    <header className="rs-page-header">
      <div className="rs-page-header__main">
        {eyebrow && <p className="rs-page-eyebrow">{eyebrow}</p>}
        <h1 className="rs-page-title">{title}</h1>
        {subtitle && (
          <p className="rs-page-subtitle">{subtitle}</p>
        )}
        {children}
      </div>
      {right && <div className="rs-page-header__actions">{right}</div>}
    </header>
  );
}
