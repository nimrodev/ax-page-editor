import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { filterDescendants, serializeModifications, stableStringify } from "./App";
import { Selection } from "./HumanPreview";

function selectionAt(path: string): Selection {
  return { axId: path, tag: "div", text: "", href: null, locator: { path, fingerprint: "x", textHint: "" } };
}

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

// NIM-56 — "Where one selected element contains another, hiding skips
// the descendant, since the ancestor's subtree already covers it." A
// locator's path is the full root-down tag chain (locator.ts's
// buildPath), so a descendant's path is always the ancestor's path plus
// ">" plus more segments — ancestry is checkable from the path strings
// alone, no real DOM needed.
describe("filterDescendants", () => {
  it("keeps a single selection unchanged", () => {
    const selections = [selectionAt("html>body>div")];
    expect(filterDescendants(selections)).toEqual(selections);
  });

  it("keeps two unrelated selections", () => {
    const selections = [selectionAt("html>body>header"), selectionAt("html>body>footer")];
    expect(filterDescendants(selections)).toEqual(selections);
  });

  it("drops a selection whose path is a descendant of another selection's path", () => {
    const ancestor = selectionAt("html>body>section");
    const descendant = selectionAt("html>body>section>p");
    expect(filterDescendants([ancestor, descendant])).toEqual([ancestor]);
    expect(filterDescendants([descendant, ancestor])).toEqual([ancestor]);
  });

  it("does not treat a same-length sibling path with a shared prefix as a descendant", () => {
    // "html>body>section" is a string-prefix of "html>body>sectionX",
    // but not a real ancestor — the ">" boundary check is what prevents
    // a false match here.
    const a = selectionAt("html>body>section");
    const b = selectionAt("html>body>sectionX");
    expect(filterDescendants([a, b])).toEqual([a, b]);
  });

  it("drops multiple descendants of the same ancestor", () => {
    const ancestor = selectionAt("html>body>section");
    const child1 = selectionAt("html>body>section>p:nth-of-type(1)");
    const child2 = selectionAt("html>body>section>p:nth-of-type(2)");
    expect(filterDescendants([ancestor, child1, child2])).toEqual([ancestor]);
  });

  it("keeps a deeper descendant covered transitively by a higher ancestor", () => {
    const ancestor = selectionAt("html>body>section");
    const grandchild = selectionAt("html>body>section>div>p");
    expect(filterDescendants([ancestor, grandchild])).toEqual([ancestor]);
  });
});
