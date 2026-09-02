import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { applyDevMutations } from "./dev-mutation";

function documentFrom(html: string) {
  return new JSDOM(html).window.document;
}

describe("applyDevMutations", () => {
  it("moves an element to a new parent", () => {
    const document = documentFrom("<body><header><p id='target'>Hello</p></header><footer></footer></body>");

    applyDevMutations(document, [{ type: "move", selector: "#target", toParentSelector: "footer" }]);

    expect(document.querySelector("header")!.contains(document.getElementById("target"))).toBe(false);
    expect(document.querySelector("footer")!.contains(document.getElementById("target"))).toBe(true);
  });

  it("moves an element to a specific index among its new siblings", () => {
    const document = documentFrom(
      "<body><main><p>A</p><p>C</p></main><p id='target'>B</p></body>",
    );

    applyDevMutations(document, [{ type: "move", selector: "#target", toParentSelector: "main", toIndex: 1 }]);

    const texts = Array.from(document.querySelectorAll("main > p")).map((el) => el.textContent);
    expect(texts).toEqual(["A", "B", "C"]);
  });

  it("edits an element's text content", () => {
    const document = documentFrom("<body><h1 id='target'>Old</h1></body>");

    applyDevMutations(document, [{ type: "edit", selector: "#target", text: "New" }]);

    expect(document.getElementById("target")!.textContent).toBe("New");
  });

  it("inserts new HTML content into a parent", () => {
    const document = documentFrom("<body><main><p>Existing</p></main></body>");

    applyDevMutations(document, [{ type: "insert", parentSelector: "main", html: "<p id='inserted'>New paragraph</p>" }]);

    expect(document.getElementById("inserted")).not.toBeNull();
    expect(document.getElementById("inserted")!.textContent).toBe("New paragraph");
  });

  it("inserts new HTML content at a specific index", () => {
    const document = documentFrom("<body><main><p>A</p><p>C</p></main></body>");

    applyDevMutations(document, [{ type: "insert", parentSelector: "main", html: "<p>B</p>", atIndex: 1 }]);

    const texts = Array.from(document.querySelectorAll("main > p")).map((el) => el.textContent);
    expect(texts).toEqual(["A", "B", "C"]);
  });

  it("deletes an element and its subtree", () => {
    const document = documentFrom("<body><nav id='target'><a href='/x'>X</a></nav><p>Keep</p></body>");

    applyDevMutations(document, [{ type: "delete", selector: "#target" }]);

    expect(document.getElementById("target")).toBeNull();
    expect(document.querySelector("p")!.textContent).toBe("Keep");
  });

  it("applies multiple mutations in order", () => {
    const document = documentFrom("<body><main><p id='a'>A</p></main></body>");

    applyDevMutations(document, [
      { type: "edit", selector: "#a", text: "A edited" },
      { type: "insert", parentSelector: "main", html: "<p id='b'>B</p>" },
    ]);

    expect(document.getElementById("a")!.textContent).toBe("A edited");
    expect(document.getElementById("b")).not.toBeNull();
  });

  it("skips a mutation whose selector matches nothing, without throwing", () => {
    const document = documentFrom("<body><p>Hello</p></body>");

    expect(() =>
      applyDevMutations(document, [{ type: "delete", selector: "#does-not-exist" }]),
    ).not.toThrow();
    expect(document.querySelector("p")!.textContent).toBe("Hello");
  });
});
