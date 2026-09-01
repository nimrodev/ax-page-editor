import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { buildMarkPayload } from "./HumanPreview";

function locator(textHint: string) {
  return { path: "p", fingerprint: "x", textHint };
}

describe("buildMarkPayload", () => {
  it("keeps only id, type, and target for a hide modification", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Footer") }];

    expect(buildMarkPayload(modifications)).toEqual([{ id: "m1", type: "hide", target: locator("Footer") }]);
  });

  it("drops the value field from a context modification — the iframe only needs a locator and a type to mark it", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: "note" } },
    ];

    const [entry] = buildMarkPayload(modifications);

    expect(entry).toEqual({ id: "m1", type: "context", target: locator("t") });
    expect(entry).not.toHaveProperty("value");
  });

  it("drops the value field from a forwardLink modification", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "forwardLink", target: locator("t"), value: { href: "https://example.com" } },
    ];

    const [entry] = buildMarkPayload(modifications);

    expect(entry).toEqual({ id: "m1", type: "forwardLink", target: locator("t") });
  });

  it("returns an empty array for no modifications, rather than throwing or returning undefined", () => {
    expect(buildMarkPayload([])).toEqual([]);
  });

  it("preserves order and count for a mixed list", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: locator("a") },
      { id: "m2", type: "context", target: locator("b"), value: { text: "note" } },
      { id: "m3", type: "forwardLink", target: locator("c"), value: { href: "https://example.com" } },
    ];

    expect(buildMarkPayload(modifications).map((e) => e.id)).toEqual(["m1", "m2", "m3"]);
  });
});
