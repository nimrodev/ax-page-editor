import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { injectBaseHref } from "./base-href";

describe("injectBaseHref", () => {
  it("adds a <base> tag pointing at the page URL, as the first child of <head>", () => {
    const dom = new JSDOM("<head><title>x</title></head><body></body>");
    injectBaseHref(dom.window.document, "https://example.com/articles/one");

    const base = dom.window.document.querySelector("head > base");
    expect(base).not.toBeNull();
    expect(base!.getAttribute("href")).toBe("https://example.com/articles/one");
    expect(dom.window.document.head.firstElementChild).toBe(base);
  });

  it("replaces an existing <base> tag rather than adding a second one", () => {
    const dom = new JSDOM('<head><base href="https://old.example.com/"></head><body></body>');
    injectBaseHref(dom.window.document, "https://example.com/page");

    const bases = dom.window.document.querySelectorAll("base");
    expect(bases).toHaveLength(1);
    expect(bases[0].getAttribute("href")).toBe("https://example.com/page");
  });

  it("creates a <head> if the document has none", () => {
    const dom = new JSDOM("<html><body>hi</body></html>");
    injectBaseHref(dom.window.document, "https://example.com/");

    expect(dom.window.document.querySelector("base")).not.toBeNull();
  });

  it("actually resolves a relative URL, not just adds the tag", () => {
    const dom = new JSDOM('<body><img src="/logo.png"></body>');
    injectBaseHref(dom.window.document, "https://example.com/articles/one");

    const img = dom.window.document.querySelector("img")!;
    expect(img.src).toBe("https://example.com/logo.png");
  });
});
