import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { buildMarkPayload } from "./HumanPreview";

function locator(textHint: string) {
  return { path: "p", fingerprint: "x", textHint };
}

describe("buildMarkPayload", () => {
  it("keeps only id, type, and target for a hide modification", () => {
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator("Footer") }];

    expect(buildMarkPayload(modifications)).toEqual([
      { id: "m1", type: "hide", target: locator("Footer"), sharedElement: false },
    ]);
  });

  it("drops the value field from a context modification — the iframe only needs a locator and a type to mark it", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: "note" } },
    ];

    const [entry] = buildMarkPayload(modifications);

    expect(entry).toEqual({ id: "m1", type: "context", target: locator("t"), sharedElement: false });
    expect(entry).not.toHaveProperty("value");
  });

  it("drops the value field from a forwardLink modification", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "forwardLink", target: locator("t"), value: { href: "https://example.com" } },
    ];

    const [entry] = buildMarkPayload(modifications);

    expect(entry).toEqual({ id: "m1", type: "forwardLink", target: locator("t"), sharedElement: false });
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

  // Reproduces a real gap found in review: the Inspector explicitly allows
  // a context note and a forwardLink on the same selection at once
  // (Inspector.tsx's canForward branch), so two modifications legitimately
  // sharing one target element is a normal case, not an edge case. The
  // overlay marks an element with a single CSS `outline`, which can't
  // stack two colors — without this flag, the second mark silently
  // replaces the first with no sign a second modification exists.
  it("flags sharedElement true when two modifications target the same locator path", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("Learn more"), value: { text: "note" } },
      { id: "m2", type: "forwardLink", target: locator("Learn more"), value: { href: "https://example.com" } },
    ];

    const entries = buildMarkPayload(modifications);

    expect(entries[0].sharedElement).toBe(true);
    expect(entries[1].sharedElement).toBe(true);
  });

  it("does not flag two modifications on different elements, even with identical text hints", () => {
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: { path: "p:nth-of-type(1)", fingerprint: "x", textHint: "Same text" } },
      { id: "m2", type: "hide", target: { path: "p:nth-of-type(2)", fingerprint: "y", textHint: "Same text" } },
    ];

    const entries = buildMarkPayload(modifications);

    expect(entries[0].sharedElement).toBe(false);
    expect(entries[1].sharedElement).toBe(false);
  });
});
