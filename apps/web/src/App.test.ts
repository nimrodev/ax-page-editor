import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { serializeModifications, stableStringify } from "./App";

describe("stableStringify", () => {
  it("produces the same string for two objects with the same keys in a different order", () => {
    const a = { id: "1", type: "context", target: { path: "p" }, value: { text: "t" } };
    const b = { id: "1", target: { path: "p" }, type: "context", value: { text: "t" } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("still distinguishes objects that actually differ in content", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("serializeModifications", () => {
  // Reproduces the actual NIM-53 bug: the server round-trips every saved
  // modification through zod's ConfigurationSchema.parse, which
  // reconstructs each object in schema-declared field order (id, target,
  // type, value) — not the order the client happened to build it in (id,
  // type, target, value). Comparing via plain JSON.stringify made a
  // freshly-saved configuration register as having unsaved changes,
  // forever, because the two "identical" lists never stringified equal.
  it("treats a modification and its server-echoed, key-reordered twin as equal", () => {
    const clientBuilt: Modification[] = [
      { id: "m1", type: "context", target: { path: "p", fingerprint: "x", textHint: "y" }, value: { text: "note" } },
    ];
    const serverEchoed: Modification[] = [
      { id: "m1", target: { fingerprint: "x", path: "p", textHint: "y" }, type: "context", value: { text: "note" } },
    ];

    expect(serializeModifications(clientBuilt)).toBe(serializeModifications(serverEchoed));
  });

  it("is insensitive to the order modifications were applied in", () => {
    const a: Modification[] = [
      { id: "m1", type: "hide", target: { path: "p1", fingerprint: "x", textHint: "" } },
      { id: "m2", type: "hide", target: { path: "p2", fingerprint: "y", textHint: "" } },
    ];
    const b = [a[1], a[0]];

    expect(serializeModifications(a)).toBe(serializeModifications(b));
  });

  it("still detects an actual content difference", () => {
    const a: Modification[] = [{ id: "m1", type: "context", target: { path: "p", fingerprint: "x", textHint: "" }, value: { text: "old" } }];
    const b: Modification[] = [{ id: "m1", type: "context", target: { path: "p", fingerprint: "x", textHint: "" }, value: { text: "new" } }];

    expect(serializeModifications(a)).not.toBe(serializeModifications(b));
  });
});
