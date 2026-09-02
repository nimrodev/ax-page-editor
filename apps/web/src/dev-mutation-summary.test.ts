import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { ModificationStatus } from "./api";
import { findTierChanges, summarizeDevMutation } from "./dev-mutation-summary";

function locator(textHint: string) {
  return { path: "p", fingerprint: "x", textHint };
}

function status(id: string, tier: ModificationStatus["tier"], overrides: Partial<ModificationStatus> = {}): ModificationStatus {
  return { id, status: tier === "stale" ? "unresolved" : "applied", tier, ...overrides };
}

describe("findTierChanges", () => {
  it("reports nothing when no modification's tier moved", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Footer") }];
    const changes = findTierChanges(modifications, [status("m1", "exact")], [status("m1", "exact")]);
    expect(changes).toEqual([]);
  });

  it("reports a modification whose tier moved from exact to drift", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Heading") }];
    const changes = findTierChanges(modifications, [status("m1", "exact")], [status("m1", "drift")]);

    expect(changes).toEqual([
      { modificationId: "m1", label: "Heading", before: "exact", after: status("m1", "drift") },
    ]);
  });

  it("skips a modification missing from either side, rather than treating it as a change", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Heading") }];
    expect(findTierChanges(modifications, [], [status("m1", "exact")])).toEqual([]);
    expect(findTierChanges(modifications, [status("m1", "exact")], [])).toEqual([]);
  });

  it("reports multiple modifications independently", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: locator("A") },
      { id: "m2", type: "hide", target: locator("B") },
    ];
    const before = [status("m1", "exact"), status("m2", "exact")];
    const after = [status("m1", "drift"), status("m2", "exact")];

    const changes = findTierChanges(modifications, before, after);

    expect(changes.map((c) => c.modificationId)).toEqual(["m1"]);
  });
});

describe("summarizeDevMutation", () => {
  it("describes a hide that drifted but stayed applied", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Heading") }];
    const lines = summarizeDevMutation(modifications, [status("m1", "exact")], [status("m1", "drift")]);

    expect(lines).toEqual([
      '"Heading" is now found at the same spot, but its content changed (drift) — still applied.',
    ]);
  });

  it("mentions needs-review for a drifted context note", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: "A note" } },
    ];
    const lines = summarizeDevMutation(
      modifications,
      [status("m1", "exact")],
      [status("m1", "drift", { needsReview: true })],
    );

    expect(lines[0]).toContain("flagged for review");
  });

  it("describes going stale as kept but not applied", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Heading") }];
    const lines = summarizeDevMutation(modifications, [status("m1", "exact")], [status("m1", "stale")]);

    expect(lines[0]).toContain("nowhere on the page (stale)");
    expect(lines[0]).toContain("kept in your configuration, not currently applied");
  });

  it("says nothing reacted when tiers are unchanged but modifications exist", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Heading") }];
    const lines = summarizeDevMutation(modifications, [status("m1", "exact")], [status("m1", "exact")]);

    expect(lines).toEqual(["Page changed, but no modification's resolution changed — none are anchored to what just moved."]);
  });

  it("invites adding a modification first when there are none at all", () => {
    const lines = summarizeDevMutation([], [], []);
    expect(lines[0]).toContain("no modifications yet");
  });
});
