import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { sanitizeHtml, sanitizeDocument } from "./sanitizer";

describe("sanitizeHtml", () => {
  it("removes script tags entirely, including their content", () => {
    const out = sanitizeHtml("<body><script>alert(1)</script><p>hi</p></body>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>hi</p>");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeHtml('<button onclick="doEvil()">Click</button>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("doEvil");
    expect(out).toContain("Click");
  });

  it("strips javascript: URLs from any attribute", () => {
    const out = sanitizeHtml('<a href="javascript:evil()">link</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("link");
  });

  it("strips javascript: URLs obfuscated with embedded whitespace", () => {
    const out = sanitizeHtml('<a href="jav&#9;a&#10;script:evil()">link</a>');
    expect(out.toLowerCase()).not.toContain("evil(");
  });

  it("neutralizes form actions while keeping the form's fields", () => {
    const out = sanitizeHtml(
      '<form action="https://evil.example.com/steal"><input name="email"></form>',
    );
    expect(out).not.toContain("evil.example.com");
    expect(out).toContain('name="email"');
  });

  it("removes nested iframes", () => {
    const out = sanitizeHtml('<div>before<iframe src="https://example.com"></iframe>after</div>');
    expect(out).not.toContain("<iframe");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("leaves ordinary safe markup untouched", () => {
    const out = sanitizeHtml('<article><h1>Title</h1><p>Body <a href="/x">link</a></p></article>');
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain('<a href="/x">link</a>');
  });
});

describe("sanitizeDocument", () => {
  it("mutates an existing jsdom Document in place, for pipelines that already hold one", () => {
    const dom = new JSDOM("<body><script>alert(1)</script><p onclick=\"x()\">hi</p></body>");
    sanitizeDocument(dom.window.document);

    expect(dom.window.document.querySelector("script")).toBeNull();
    expect(dom.window.document.querySelector("p")!.hasAttribute("onclick")).toBe(false);
    expect(dom.window.document.querySelector("p")!.textContent).toBe("hi");
  });
});

describe("sanitizeDocument keeps presentation intact", () => {
  it("does not remove <style> tags — a security sanitizer, not a noise filter", () => {
    const dom = new JSDOM("<head><style>.foo{color:red}</style></head><body><p>hi</p></body>");
    sanitizeDocument(dom.window.document);

    expect(dom.window.document.querySelector("style")).not.toBeNull();
  });
});

describe("sanitizeDocument and <template>", () => {
  it("sanitizes content nested inside a <template>, which querySelectorAll does not walk into", () => {
    const dom = new JSDOM(
      '<body><template id="t"><script>alert(1)</script><button onclick="x()">go</button></template></body>',
    );
    sanitizeDocument(dom.window.document);

    const serialized = dom.serialize();
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("onclick");
  });
});

