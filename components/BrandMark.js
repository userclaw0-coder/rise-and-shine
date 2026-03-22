/**
 * Full lockup: /public/brand/rise-shine-logo-full.png (trimmed artwork + wordmark).
 * Small header / favicon-style tile: /public/brand/logo-mark.png (sun + landscape only).
 */

export const BRAND_LOGO_SRC = "/brand/rise-shine-logo-full.png";
export const BRAND_MARK_SRC = "/brand/logo-mark.png";

const DEFAULT_ALT = "Rise & Shine";

/** Square icon for top bars (sun + hills mark). Use alt="" when a text label sits beside it. */
export function BrandMarkIcon({ size = 36, className = "", alt = "" }) {
  return (
    <span
      className={`rs-brand-mark rs-brand-mark--logo ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <img src={BRAND_MARK_SRC} alt={alt} width={size} height={size} decoding="async" />
    </span>
  );
}

/** Full vertical logo for sidebar / marketing (includes “RISE & SHINE” type). */
export function BrandMarkLockup({
  className = "",
  maxHeight = 80,
  alt = DEFAULT_ALT,
}) {
  return (
    <div className={`rs-brand-lockup ${className}`.trim()}>
      <img
        src={BRAND_LOGO_SRC}
        alt={alt}
        decoding="async"
        style={{
          display: "block",
          maxHeight,
          width: "auto",
          maxWidth: "min(260px, 100%)",
          objectFit: "contain",
        }}
      />
    </div>
  );
}
