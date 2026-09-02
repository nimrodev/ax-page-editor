import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { buildLocator } from "@ax/schema";
import { resolveLocator } from "./resolve-locator";

function documentFrom(html: string) {
  return new JSDOM(html).window.document;
}

describe("resolveLocator", () => {
  it("resolves exact when both the path and the fingerprint match", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Body text</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    expect(resolveLocator(document, locator)).toEqual({ tier: "exact", element: target });
  });

  it("resolves each of two same-tag siblings to the correct one", () => {
    const document = documentFrom("<body><div><p>one</p><p>two</p></div></body>");
    const first = document.querySelector("div > p:nth-of-type(1)")!;
    const second = document.querySelector("div > p:nth-of-type(2)")!;

    expect(resolveLocator(document, buildLocator(first))).toEqual({ tier: "exact", element: first });
    expect(resolveLocator(document, buildLocator(second))).toEqual({ tier: "exact", element: second });
  });

  it("goes stale when the path no longer resolves and no fingerprint match exists anywhere", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Body text</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    const changed = documentFrom("<body><main><h1>Title</h1></main></body>");
    expect(resolveLocator(changed, locator)).toEqual({ tier: "stale" });
  });

  // CONTEXT.md — Drift: "A locator whose structural position still
  // resolves but whose element content has changed." The modification
  // still applies (per type, in apply-modifications.ts); resolution's own
  // job here is just to report the tier honestly rather than pretend it's
  // an exact match or drop it as unresolved.
  it("resolves drift when the path resolves but the fingerprint no longer matches", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Body text</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    const changed = documentFrom("<body><main><h1>Title</h1><p>Completely different</p></main></body>");
    const driftedTarget = changed.querySelector("p")!;
    expect(resolveLocator(changed, locator)).toEqual({ tier: "drift", element: driftedTarget });
  });

  // CONTEXT.md — Re-anchor: "A locator whose structural position no
  // longer resolves, but whose fingerprint is found elsewhere on the
  // page."
  it("re-anchors when the path no longer resolves but the fingerprint is found at a single other position", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Moved paragraph</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    const changed = documentFrom(
      "<body><header><nav>Menu</nav></header><main><h1>Title</h1><footer><p>Moved paragraph</p></footer></main></body>",
    );
    const movedTarget = changed.querySelector("footer > p")!;
    expect(resolveLocator(changed, locator)).toEqual({ tier: "reanchor", element: movedTarget });
  });

  // ADR-0003 / acceptance criteria: "A fingerprint matching several
  // candidates prefers the nearest by structural distance, and goes stale
  // rather than guessing when there is no nearest."
  it("re-anchors to the structurally nearest of several fingerprint matches", () => {
    const document = documentFrom("<body><main><article><p>Shared text</p></article></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    // Original path body>main>article>p no longer resolves at all (no
    // <article> exists here). Of the two fingerprint matches, one kept
    // its "main" ancestor and only had its innermost wrapper renamed
    // (body>main>section>p), the other sits under an unrelated subtree
    // (body>aside>p) — the first shares more of the original path.
    const changed = documentFrom(
      "<body><aside><p>Shared text</p></aside><main><section><p>Shared text</p></section></main></body>",
    );
    const nearer = changed.querySelector("main > section > p")!;
    expect(resolveLocator(changed, locator)).toEqual({ tier: "reanchor", element: nearer });
  });

  it("goes stale rather than guessing when two fingerprint matches are equally near", () => {
    const document = documentFrom("<body><main><section><p>Shared text</p></section></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    // Two candidates, each one segment away from the original path in the
    // same way (a differently-tagged single-element wrapper standing in
    // for the original "main") — neither is nearer than the other.
    const changed = documentFrom(
      "<body><header><p>Shared text</p></header><aside><p>Shared text</p></aside></body>",
    );
    expect(resolveLocator(changed, locator)).toEqual({ tier: "stale" });
  });
});
