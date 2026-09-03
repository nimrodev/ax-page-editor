import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { buildReviewEntries, buildResolutionSummary } from "./ReviewPanel";

function locator(textHint: string) {
  return { path: "p", fingerprint: "x", textHint };
}

describe("buildReviewEntries", () => {
  it("lists every modification regardless of type, with a status and label", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: locator("Footer") },
      { id: "m2", type: "context", target: locator("Chart"), value: { text: "Shows revenue" } },
    ];
    const entries = buildReviewEntries(modifications, [
      { id: "m1", status: "applied" },
      { id: "m2", status: "applied" },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ modification: modifications[0], status: "applied", label: "Footer" });
    expect(entries[1]).toEqual({
      modification: modifications[1],
      status: "applied",
      label: "Shows revenue",
      targetHint: "Chart",
    });
  });

  it("defaults to unresolved for a modification the last render never reported on", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Newly added") }];

    const entries = buildReviewEntries(modifications, []);

    expect(entries[0].status).toBe("unresolved");
  });

  it("carries a shadowed status through unchanged", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: "note" } },
    ];

    const entries = buildReviewEntries(modifications, [{ id: "m1", status: "shadowed" }]);

    expect(entries[0].status).toBe("shadowed");
  });

  // NIM-54 — CONTEXT.md's "Needs review": editorial-only state for a
  // drifted context note, carried through so the publisher's review list
  // can flag it even though it's still "applied".
  it("carries needsReview through for a drifted context note", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: "note" } },
    ];

    const entries = buildReviewEntries(modifications, [{ id: "m1", status: "applied", needsReview: true }]);

    expect(entries[0]).toEqual({
      modification: modifications[0],
      status: "applied",
      needsReview: true,
      label: "note",
      targetHint: "t",
    });
  });

  it("omits needsReview, rather than setting it false, for an ordinary applied modification", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Footer") }];

    const entries = buildReviewEntries(modifications, [{ id: "m1", status: "applied" }]);

    expect(entries[0]).not.toHaveProperty("needsReview");
  });

  it("carries a targetHint for a context modification, so identical bulk-applied notes stay distinguishable", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("Q3 revenue chart"), value: { text: "Shared note" } },
    ];

    const entries = buildReviewEntries(modifications, [{ id: "m1", status: "applied" }]);

    expect(entries[0].targetHint).toBe("Q3 revenue chart");
  });

  it("omits targetHint for a hide, since its label is already the target's textHint", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Footer") }];

    const entries = buildReviewEntries(modifications, [{ id: "m1", status: "applied" }]);

    expect(entries[0].targetHint).toBeUndefined();
  });
});

// NIM-54 acceptance criteria: "When a large share of locators fail at
// once, the interface reports one page-level message rather than a list
// of individual failures" — e.g. the publisher pointed a saved
// configuration at the wrong page entirely, and every locator is
// unresolved at once. A single stray failure is still just a row-level
// "Unresolved" badge; this is specifically for the broad case.
describe("buildResolutionSummary", () => {
  it("reports no broad failure when nothing is unresolved", () => {
    const entries = [
      { status: "applied" as const },
      { status: "applied" as const },
    ];
    expect(buildResolutionSummary(entries)).toEqual({ unresolvedCount: 0, total: 2, broadFailure: false });
  });

  it("does not flag broad failure for a single stray unresolved entry among many", () => {
    const entries = [
      { status: "applied" as const },
      { status: "applied" as const },
      { status: "applied" as const },
      { status: "unresolved" as const },
    ];
    expect(buildResolutionSummary(entries).broadFailure).toBe(false);
  });

  it("flags broad failure once at least half of all modifications are unresolved", () => {
    const entries = [
      { status: "unresolved" as const },
      { status: "unresolved" as const },
      { status: "applied" as const },
      { status: "applied" as const },
    ];
    expect(buildResolutionSummary(entries)).toEqual({ unresolvedCount: 2, total: 4, broadFailure: true });
  });

  it("does not flag broad failure for an empty list, rather than dividing by zero", () => {
    expect(buildResolutionSummary([])).toEqual({ unresolvedCount: 0, total: 0, broadFailure: false });
  });
});
