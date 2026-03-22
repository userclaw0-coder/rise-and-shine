/**
 * Canonical site origin for absolute URLs (Open Graph, Twitter cards).
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://yourdomain.com).
 * On Vercel, VERCEL_URL is used as a fallback when the public URL is unset.
 */
export function getSiteOrigin() {
  if (typeof process === "undefined") return "";
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "";
}

export function absoluteUrl(path) {
  const origin = getSiteOrigin();
  if (!origin) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}
