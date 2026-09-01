/**
 * Query parameters that carry no page identity — stripped so a link
 * shared over email or social media collapses onto the same Configuration
 * (CONTEXT.md — Configuration) as the same page visited directly.
 */
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = new Set([
  "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src", "yclid", "dclid", "_ga",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAM_NAMES.has(lower) || TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export interface NormalizedUrl {
  /** The configuration's storage identity — never shown to the publisher. */
  normalized: string;
  /** Exactly what was passed in, retained for display (NIM-53). */
  original: string;
}

/**
 * Collapses cosmetic differences between two addresses for the same page
 * onto one Configuration identity, while leaving anything that could
 * denote a genuinely different page untouched:
 *
 * - Fragment dropped — it never leaves the browser, so no server-rendered
 *   agent payload could ever depend on it.
 * - Trailing slash on a non-root path dropped ("/pricing/" and "/pricing"
 *   are the same page in practice — link-forward.ts's self-link check
 *   makes the same call).
 * - Scheme and host lowercased — both are case-insensitive by spec. The
 *   path is left exactly as given: unlike the host, many real servers do
 *   treat path casing as meaningful.
 * - Tracking parameters removed, remaining parameters sorted by name —
 *   so "?id=1&utm_source=x" and "?utm_source=y&id=1" both collapse onto
 *   "?id=1". A parameter that isn't a known tracking name is assumed to
 *   denote a different page and is always kept.
 */
export function normalizeUrl(input: string): NormalizedUrl {
  const url = new URL(input);
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  const keptParams = Array.from(url.searchParams.entries())
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [name, value] of keptParams) {
    url.searchParams.append(name, value);
  }

  return { normalized: url.toString(), original: input };
}
