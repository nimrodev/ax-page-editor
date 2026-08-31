import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { assignAxIds } from "./ax-id";

describe("assignAxIds", () => {
  it("assigns a distinct data-ax-id to every element", () => {
    const dom = new JSDOM("<body><div><p>a</p><p>b</p></div></body>");
    assignAxIds(dom.window.document);

    const ids = Array.from(dom.window.document.querySelectorAll("[data-ax-id]")).map((el) =>
      el.getAttribute("data-ax-id"),
    );

    expect(ids.length).toBeGreaterThanOrEqual(3); // div + 2 p
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns ids in document order, deterministically", () => {
    const dom = new JSDOM("<body><h1>Title</h1><p>Body</p></body>");
    assignAxIds(dom.window.document);

    const h1Id = dom.window.document.querySelector("h1")!.getAttribute("data-ax-id");
    const pId = dom.window.document.querySelector("p")!.getAttribute("data-ax-id");

    // Re-running on an identically-structured fresh document gives the same ids.
    const dom2 = new JSDOM("<body><h1>Title</h1><p>Body</p></body>");
    assignAxIds(dom2.window.document);
    expect(dom2.window.document.querySelector("h1")!.getAttribute("data-ax-id")).toBe(h1Id);
    expect(dom2.window.document.querySelector("p")!.getAttribute("data-ax-id")).toBe(pId);
  });
});
