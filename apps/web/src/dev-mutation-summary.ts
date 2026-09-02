import { Modification } from "@ax/schema";
import { ModificationStatus } from "./api";
import { labelFor, LABEL_LIMIT, truncate } from "./ModificationNavigator";

/**
 * Reported for every modification whose resolution tier actually changed
 * between two renders — the dev-mutation panel's whole point (NIM-54) is
 * making that reaction visible, so "nothing changed" is exactly as
 * meaningful a result as "this one drifted".
 */
export interface TierChange {
  modificationId: string;
  label: string;
  before: ModificationStatus["tier"];
  after: ModificationStatus;
}

const TIER_LABEL: Record<ModificationStatus["tier"], string> = {
  exact: "an exact match",
  drift: "the same spot, but its content changed (drift)",
  reanchor: "a new position, matched by fingerprint (re-anchored)",
  stale: "nowhere on the page (stale)",
};

function statusNote(after: ModificationStatus): string {
  if (after.status === "unresolved") return "kept in your configuration, not currently applied";
  if (after.status === "shadowed") return "shadowed by another hidden element";
  return after.needsReview ? "still applied, flagged for review" : "still applied";
}

/** One human-readable sentence for a single tier change, e.g. for the dev panel's result strip. */
export function describeTierChange(change: TierChange): string {
  return `"${change.label}" is now found at ${TIER_LABEL[change.after.tier]} — ${statusNote(change.after)}.`;
}

/**
 * Diffs two renders' modificationStatuses by id and reports every
 * modification whose tier actually moved — the direct answer to "what
 * just happened" after a dev mutation or reset. Modifications with no
 * status in one side (freshly added, or dropped) are skipped: there's no
 * "before" or "after" tier to compare, and this is about reaction to
 * change, not membership.
 */
export function findTierChanges(
  modifications: Modification[],
  before: ModificationStatus[],
  after: ModificationStatus[],
): TierChange[] {
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterById = new Map(after.map((s) => [s.id, s]));

  const changes: TierChange[] = [];
  for (const modification of modifications) {
    const beforeStatus = beforeById.get(modification.id);
    const afterStatus = afterById.get(modification.id);
    if (!beforeStatus || !afterStatus) continue;
    if (beforeStatus.tier === afterStatus.tier) continue;
    changes.push({
      modificationId: modification.id,
      label: truncate(labelFor(modification), LABEL_LIMIT),
      before: beforeStatus.tier,
      after: afterStatus,
    });
  }
  return changes;
}

/**
 * The dev panel's one-line-or-few-lines result — either every reaction
 * found, or an explicit "nothing to show yet" so a no-op mutation never
 * looks identical to a broken button.
 */
export function summarizeDevMutation(
  modifications: Modification[],
  before: ModificationStatus[],
  after: ModificationStatus[],
): string[] {
  const changes = findTierChanges(modifications, before, after);
  if (changes.length > 0) return changes.map(describeTierChange);
  if (modifications.length === 0) {
    return ["Page changed, but there are no modifications yet to react to it — add one (e.g. hide the heading), then try this again."];
  }
  return ["Page changed, but no modification's resolution changed — none are anchored to what just moved."];
}
