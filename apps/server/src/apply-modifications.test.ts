import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { buildLocator, Modification } from "@ax/schema";
import { applyModifications, dedupeModifications } from "./apply-modifications";

function documentFrom(html: string) {
  return new JSDOM(html).window.document;
}

describe("applyModifications", () => {
  it("removes the element and its entire subtree for a hide modification", () => {
    const document = documentFrom(
      "<body><nav><ul><li><a href='/a'>A</a></li><li><a href='/b'>B</a></li></ul></nav><main><p>Keep me</p></main></body>",
    );
    const nav = document.querySelector("nav")!;
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: buildLocator(nav) },
    ];

    applyModifications(document, modifications);

    expect(document.querySelector("nav")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
    expect(document.body.innerHTML).not.toContain("A");
    expect(document.body.innerHTML).not.toContain("B");
    expect(document.querySelector("p")!.textContent).toBe("Keep me");
  });

  it("skips a modification whose locator does not resolve, without throwing", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const fakeLocator = { path: "html>body>p:nth-of-type(9)", fingerprint: "x", textHint: "x" };
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: fakeLocator },
    ];

    expect(() => applyModifications(document, modifications)).not.toThrow();
    expect(document.querySelector("p")!.textContent).toBe("Hello");
  });

  it("applies multiple hide modifications independently", () => {
    const document = documentFrom("<body><header>H</header><p>Keep</p><footer>F</footer></body>");
    const header = document.querySelector("header")!;
    const footer = document.querySelector("footer")!;
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: buildLocator(header) },
      { id: "m2", type: "hide", target: buildLocator(footer) },
    ];

    applyModifications(document, modifications);

    expect(document.querySelector("header")).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
    expect(document.querySelector("p")!.textContent).toBe("Keep");
  });

  it("does nothing for modification types not yet implemented (context, forwardLink)", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "a note" } },
      { id: "m2", type: "forwardLink", target, value: { href: "https://example.com/x" } },
    ];

    expect(() => applyModifications(document, modifications)).not.toThrow();
    expect(document.querySelector("p")).not.toBeNull();
  });
});

describe("dedupeModifications", () => {
  it("keeps only one entry per (target path, type), even with different ids", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target },
      { id: "m2", type: "hide", target },
    ];

    const deduped = dedupeModifications(modifications);

    expect(deduped).toHaveLength(1);
  });

  it("keeps the last one when the same (target, type) is submitted more than once", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "first draft" } },
      { id: "m2", type: "context", target, value: { text: "final version" } },
    ];

    const deduped = dedupeModifications(modifications);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("m2");
  });

  it("keeps modifications with the same target but different types", () => {
    const document = documentFrom("<body><a href='/x'>link</a></body>");
    const target = buildLocator(document.querySelector("a")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "a note" } },
      { id: "m2", type: "forwardLink", target, value: { href: "https://example.com/x" } },
    ];

    expect(dedupeModifications(modifications)).toHaveLength(2);
  });

  it("keeps modifications targeting different elements", () => {
    const document = documentFrom("<body><header>H</header><footer>F</footer></body>");
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: buildLocator(document.querySelector("header")!) },
      { id: "m2", type: "hide", target: buildLocator(document.querySelector("footer")!) },
    ];

    expect(dedupeModifications(modifications)).toHaveLength(2);
  });
});
