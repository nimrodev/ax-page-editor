import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { buildReviewEntries } from "./ReviewPanel";

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
    expect(entries[1]).toEqual({ modification: modifications[1], status: "applied", label: "Shows revenue" });
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
});
