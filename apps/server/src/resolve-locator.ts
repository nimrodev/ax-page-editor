import { buildLocator, Locator } from "@ax/schema";

/**
 * The four graded tiers from ADR-0003 / CONTEXT.md — Locator: "exact"
 * (path and fingerprint both match), "drift" (path resolves, fingerprint
 * doesn't — the element's content changed underneath it), "reanchor"
 * (path no longer resolves, but the fingerprint is found elsewhere), and
 * "stale" (resolves neither way, or a fingerprint match exists but isn't
 * uniquely nearest). Callers decide what each tier means for a given
 * modification type (apply-modifications.ts) — resolution's only job is
 * reporting which one actually happened, honestly.
 */
export type LocatorResolution = { tier: "exact" | "drift" | "reanchor"; element: Element } | { tier: "stale" };

/**
 * A cheap stand-in for tree-edit distance: how many path segments differ
 * once the two paths' shared root prefix is set aside, counted on both
 * sides so a candidate that's shorter *or* longer than the original path
 * is still comparable. Not full tree-edit distance — this only needs to
 * rank candidates relative to each other, not measure "how different" in
 * any absolute sense.
 */
function structuralDistance(pathA: string, pathB: string): number {
  const a = pathA.split(">");
  const b = pathB.split(">");
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) {
    common++;
  }
  return a.length - common + (b.length - common);
}

/**
 * Finds every element elsewhere in the document whose fingerprint matches
 * — the search a locator's path failing forces (re-anchor). Walking every
 * element is the only option here: a fingerprint is a content hash, not a
 * queryable attribute, so there's no selector that could narrow this down
 * up front.
 */
function findByFingerprint(document: Document, fingerprint: string): Element[] {
  const matches: Element[] = [];
  for (const element of document.querySelectorAll("*")) {
    if (buildLocator(element).fingerprint === fingerprint) {
      matches.push(element);
    }
  }
  return matches;
}

/**
 * Resolves a stored locator against a live document, in the graded order
 * ADR-0003 specifies: try the exact structural path first (splitting into
 * exact/drift by whether the fingerprint still matches what's there), and
 * only search the whole document by fingerprint — re-anchor, or stale if
 * that search comes up empty or ambiguous — once the path itself fails.
 * A malformed/unresolvable path (a stale ax-id era selector, say) is
 * treated the same as "not found" rather than thrown.
 */
export function resolveLocator(document: Document, locator: Locator): LocatorResolution {
  let candidate: Element | null;
  try {
    candidate = document.querySelector(locator.path);
  } catch {
    candidate = null;
  }

  if (candidate) {
    const current = buildLocator(candidate);
    return current.fingerprint === locator.fingerprint
      ? { tier: "exact", element: candidate }
      : { tier: "drift", element: candidate };
  }

  const matches = findByFingerprint(document, locator.fingerprint);
  if (matches.length === 0) return { tier: "stale" };
  if (matches.length === 1) return { tier: "reanchor", element: matches[0] };

  const ranked = matches
    .map((element) => ({ element, distance: structuralDistance(locator.path, buildLocator(element).path) }))
    .sort((a, b) => a.distance - b.distance);
  const [nearest, runnerUp] = ranked;
  if (runnerUp && runnerUp.distance === nearest.distance) return { tier: "stale" };
  return { tier: "reanchor", element: nearest.element };
}
