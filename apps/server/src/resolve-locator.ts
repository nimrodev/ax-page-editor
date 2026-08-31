import { buildLocator, Locator } from "@ax/schema";

/**
 * Resolves a stored locator against a live document — exact tier only:
 * the structural path resolves and its element's current fingerprint
 * matches the stored one. Drift, re-anchoring, and staleness (the other
 * three tiers in CONTEXT.md's resolution model) land in a later slice;
 * for now, anything short of an exact match returns null, and the caller
 * skips the modification rather than guessing.
 */
export function resolveLocator(document: Document, locator: Locator): Element | null {
  let candidate: Element | null;
  try {
    candidate = document.querySelector(locator.path);
  } catch {
    return null;
  }

  if (!candidate) return null;

  const current = buildLocator(candidate);
  if (current.fingerprint !== locator.fingerprint) return null;

  return candidate;
}
