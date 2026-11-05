/**
 * Where to send someone after sign-in: a path on this site, or the dashboard.
 * Resolves the value against the site and keeps it only if it stays on the
 * same origin, so "//evil.com", "/\evil.com", encoded tricks and absolute
 * URLs all fall back. Returns a path (with query and hash), never a URL.
 */
export function safeNext(next: string | null | undefined, site: string, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(next, site);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(site).origin) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
