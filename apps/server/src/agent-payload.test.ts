import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { assignAxIds } from "./ax-id";
import { buildAgentPayload } from "./agent-payload";

function prepare(html: string) {
  const dom = new JSDOM(html);
  assignAxIds(dom.window.document);
  return dom.window.document;
}

describe("buildAgentPayload", () => {
  it("produces one markdown block per block-level element, each carrying its ax-id", () => {
    const doc = prepare("<body><h1>Title</h1><p>First paragraph.</p><p>Second paragraph.</p></body>");
    const payload = buildAgentPayload(doc);

    expect(payload.markdownBlocks).toHaveLength(3);
    expect(payload.markdownBlocks[0].markdown).toContain("Title");
    expect(payload.markdownBlocks[1].markdown).toContain("First paragraph");
    expect(payload.markdownBlocks[2].markdown).toContain("Second paragraph");
    for (const block of payload.markdownBlocks) {
      expect(block.axId).toMatch(/^ax-\d+$/);
    }
  });

  it("does not duplicate content when a block element is nested inside another block element", () => {
    const doc = prepare("<body><blockquote><p>Quoted text</p></blockquote></body>");
    const payload = buildAgentPayload(doc);

    const combined = payload.markdownBlocks.map((b) => b.markdown).join(" ");
    expect(combined.match(/Quoted text/g)?.length).toBe(1);
  });

  it("skips blocks that produce no readable text", () => {
    const doc = prepare("<body><p>   </p><p>Real content</p></body>");
    const payload = buildAgentPayload(doc);

    expect(payload.markdownBlocks).toHaveLength(1);
    expect(payload.markdownBlocks[0].markdown).toContain("Real content");
  });

  it("captures list items as their own blocks", () => {
    const doc = prepare("<body><ul><li>One</li><li>Two</li></ul></body>");
    const payload = buildAgentPayload(doc);

    expect(payload.markdownBlocks).toHaveLength(2);
    expect(payload.markdownBlocks[0].markdown).toContain("One");
    expect(payload.markdownBlocks[1].markdown).toContain("Two");
  });

  it("also returns the full document as cleaned HTML", () => {
    const doc = prepare("<body><p>Hello</p></body>");
    const payload = buildAgentPayload(doc);

    expect(payload.html).toContain("<p");
    expect(payload.html).toContain("Hello");
  });
});

describe("buildAgentPayload strips presentational noise", () => {
  it("removes <style> blocks from the cleaned HTML output", () => {
    const doc = prepare(
      "<head><style>.foo{color:red}/* megabytes of CSS-in-JS */</style></head><body><p>Real content</p></body>",
    );
    const payload = buildAgentPayload(doc);

    expect(payload.html).not.toContain("<style");
    expect(payload.html).not.toContain("color:red");
    expect(payload.html).toContain("Real content");
  });

  it("removes <style> blocks nested inside a <template>", () => {
    const doc = prepare("<body><template><style>.x{color:blue}</style></template></body>");
    const payload = buildAgentPayload(doc);

    expect(payload.html).not.toContain("<style");
  });
});
