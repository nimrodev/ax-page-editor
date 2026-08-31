import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { buildLocator } from "@ax/schema";
import { resolveLocator } from "./resolve-locator";

function documentFrom(html: string) {
  return new JSDOM(html).window.document;
}

describe("resolveLocator", () => {
  it("resolves when both the path and the fingerprint match", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Body text</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    const resolved = resolveLocator(document, locator);

    expect(resolved).toBe(target);
  });

  it("returns null when the path no longer resolves", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Body text</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    const changed = documentFrom("<body><main><h1>Title</h1></main></body>");
    expect(resolveLocator(changed, locator)).toBeNull();
  });

  it("returns null when the path resolves but the content has drifted", () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Body text</p></main></body>");
    const target = document.querySelector("p")!;
    const locator = buildLocator(target);

    // Same structural slot, different content — a drift case. Exact
    // resolution only, per this ticket's scope; drift is handled later.
    const changed = documentFrom("<body><main><h1>Title</h1><p>Completely different</p></main></body>");
    expect(resolveLocator(changed, locator)).toBeNull();
  });

  it("resolves each of two same-tag siblings to the correct one", () => {
    const document = documentFrom("<body><div><p>one</p><p>two</p></div></body>");
    const first = document.querySelector("div > p:nth-of-type(1)")!;
    const second = document.querySelector("div > p:nth-of-type(2)")!;

    expect(resolveLocator(document, buildLocator(first))).toBe(first);
    expect(resolveLocator(document, buildLocator(second))).toBe(second);
  });
});
