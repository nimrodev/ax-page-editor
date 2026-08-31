import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { buildLocator } from "./locator";


function element(html: string, selector: string) {
  const dom = new JSDOM(html);
  return dom.window.document.querySelector(selector)!;
}

describe("buildLocator", () => {
  it("builds a structural path from the document root to the element", () => {
    const el = element("<body><main><article><p>hi</p></article></main></body>", "p");
    const locator = buildLocator(el);

    expect(locator.path).toBe("html>body>main>article>p");
  });

  it("disambiguates siblings of the same tag with nth-of-type", () => {
    const el = element(
      "<body><div><p>one</p><p>two</p><p>three</p></div></body>",
      "div > p:nth-of-type(2)",
    );
    const locator = buildLocator(el);

    expect(locator.path).toBe("html>body>div>p:nth-of-type(2)");
  });

  it("omits nth-of-type when the element is the only one of its tag among its siblings", () => {
    const el = element("<body><div><h1>Title</h1><p>Body</p></div></body>", "h1");
    const locator = buildLocator(el);

    expect(locator.path).toBe("html>body>div>h1");
  });

  it("produces the same path for structurally identical elements", () => {
    const a = element("<body><p>hello</p></body>", "p");
    const b = element("<body><p>different text</p></body>", "p");

    expect(buildLocator(a).path).toBe(buildLocator(b).path);
  });

  it("produces a different fingerprint when text content differs", () => {
    const a = element("<body><p>hello</p></body>", "p");
    const b = element("<body><p>different text</p></body>", "p");

    expect(buildLocator(a).fingerprint).not.toBe(buildLocator(b).fingerprint);
  });

  it("produces the same fingerprint for the same tag and text, regardless of path", () => {
    const a = element("<body><div><p>hello</p></div></body>", "p");
    const b = element("<body><section><article><p>hello</p></article></section></body>", "p");

    expect(buildLocator(a).fingerprint).toBe(buildLocator(b).fingerprint);
  });

  it("normalizes whitespace in text content before fingerprinting", () => {
    const a = element("<body><p>hello   world</p></body>", "p");
    const b = element("<body><p>hello\n  world</p></body>", "p");

    expect(buildLocator(a).fingerprint).toBe(buildLocator(b).fingerprint);
  });

  it("incorporates href into the fingerprint for links, so two links with the same text differ", () => {
    const a = element('<body><a href="/one">Learn more</a></body>', "a");
    const b = element('<body><a href="/two">Learn more</a></body>', "a");

    expect(buildLocator(a).fingerprint).not.toBe(buildLocator(b).fingerprint);
  });

  it("incorporates src into the fingerprint for images", () => {
    const a = element('<body><img src="/one.png"></body>', "img");
    const b = element('<body><img src="/two.png"></body>', "img");

    expect(buildLocator(a).fingerprint).not.toBe(buildLocator(b).fingerprint);
  });

  it("uses trimmed text content as the human-readable hint, truncated for very long text", () => {
    const el = element("<body><p>  Book a demo today  </p></body>", "p");
    expect(buildLocator(el).textHint).toBe("Book a demo today");

    const longText = "x".repeat(500);
    const longEl = element(`<body><p>${longText}</p></body>`, "p");
    expect(buildLocator(longEl).textHint.length).toBeLessThanOrEqual(120);
  });
});
