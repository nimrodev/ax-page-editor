import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { nearestBlockAncestor } from "./block-ancestor";

function documentFrom(html: string) {
  return new JSDOM(html).window.document;
}

describe("nearestBlockAncestor", () => {
  it("returns the element itself when it is already block-level", () => {
    const document = documentFrom("<body><p>text</p></body>");
    const p = document.querySelector("p")!;
    expect(nearestBlockAncestor(p)).toBe(p);
  });

  it("climbs past inline elements to the nearest block-level ancestor", () => {
    const document = documentFrom(
      "<body><h1><span lang='en'><span class='inner'>Title</span></span></h1></body>",
    );
    const inner = document.querySelector(".inner")!;
    const h1 = document.querySelector("h1")!;
    expect(nearestBlockAncestor(inner)).toBe(h1);
  });

  it("climbs past an anchor to its containing paragraph", () => {
    const document = documentFrom("<body><p>See our <a href='/x'>pricing page</a> for details.</p></body>");
    const a = document.querySelector("a")!;
    const p = document.querySelector("p")!;
    expect(nearestBlockAncestor(a)).toBe(p);
  });

  it("falls back to the document body if nothing block-level is found above", () => {
    const document = documentFrom("<body><span>lone inline text</span></body>");
    const span = document.querySelector("span")!;
    expect(nearestBlockAncestor(span)).toBe(document.body);
  });

  it("does not climb past a non-inline leaf element like <img>, even directly under <body>", () => {
    // The element being non-inline is what matters, not whether it's
    // itself a container — an <img> is content in its own right, not
    // text-flow formatting, so it must never be treated as something to
    // climb past just because its parent happens to be block-level too.
    const document = documentFrom("<body><img src='/chart.png'></body>");
    const img = document.querySelector("img")!;
    expect(nearestBlockAncestor(img)).toBe(img);
  });

  it("does not climb past a button nested only one level under body", () => {
    const document = documentFrom("<body><button>Click me</button></body>");
    const button = document.querySelector("button")!;
    expect(nearestBlockAncestor(button)).toBe(button);
  });

  it("climbs past a call-to-action embedded inline in a paragraph to the paragraph itself", () => {
    const document = documentFrom("<body><p>Read more <button>Learn more</button></p></body>");
    const button = document.querySelector("button")!;
    const p = document.querySelector("p")!;
    expect(nearestBlockAncestor(button)).toBe(p);
  });

  it("climbs past a nested container to the outermost one, e.g. a paragraph inside a list item", () => {
    const document = documentFrom("<body><ul><li><p>Item text <button>Buy</button></p></li></ul></body>");
    const button = document.querySelector("button")!;
    const li = document.querySelector("li")!;
    expect(nearestBlockAncestor(button)).toBe(li);
  });
});
