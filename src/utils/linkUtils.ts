/**
 * URL / link helpers.
 *
 * Rule: internal routes use <Link to="..."> (React Router, no page reload).
 *       external URLs use <a href="..." target="_blank" rel="noreferrer">.
 */

/** Returns true when the URL starts with http:// or https:// */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Convert a URL that may be absolute (http://localhost:5173/foo) into
 * a root-relative path (/foo) safe for React Router <Link to={...}>.
 *
 * If the URL is already relative it is returned as-is.
 * Truly external URLs (different origin) are returned unchanged.
 */
export function toInternalPath(url: string): string {
  if (!isExternalUrl(url)) return url; // already relative

  try {
    const parsed = new URL(url);
    // Same origin or localhost → strip to pathname
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === window.location.hostname
    ) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Malformed URL — return as-is
  }
  return url;
}
