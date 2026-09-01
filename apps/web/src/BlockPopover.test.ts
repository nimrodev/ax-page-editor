import { describe, expect, it } from "vitest";
import { Modification } from "@ax/schema";
import { MarkdownBlock } from "./api";
import { buildBlockPopoverModel } from "./BlockPopover";

function locator(textHint: string) {
  return { path: "p", fingerprint: "x", textHint };
}

describe("buildBlockPopoverModel", () => {
  it("is actionable for an ordinary page block — nothing to show but Locate/Hide/Add context", () => {
    const block: MarkdownBlock = { axId: "ax-1", markdown: "Our returns policy...", source: "page" };

    expect(buildBlockPopoverModel(block, [])).toEqual({ kind: "actionable" });
  });

  it("surfaces the existing modification for a context-note block, rather than offering to add a new one", () => {
    const block: MarkdownBlock = {
      axId: "ax-2",
      markdown: "Shows quarterly revenue.",
      source: "context",
      modificationId: "m1",
    };
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: "Shows quarterly revenue." } },
    ];

    expect(buildBlockPopoverModel(block, modifications)).toEqual({
      kind: "existing",
      modification: modifications[0],
      label: "Shows quarterly revenue.",
    });
  });

  it("surfaces the existing modification for a forwarded-content block", () => {
    const block: MarkdownBlock = {
      axId: "ax-3",
      markdown: "From: https://example.com",
      source: "forwarded",
      modificationId: "m2",
    };
    const modifications: Modification[] = [
      { id: "m2", type: "forwardLink", target: locator("t"), value: { href: "https://example.com" } },
    ];

    const model = buildBlockPopoverModel(block, modifications);

    expect(model.kind).toBe("existing");
    if (model.kind === "existing") expect(model.modification.id).toBe("m2");
  });

  it("falls back to actionable if a modificationId points at nothing in the current list — e.g. it was just removed", () => {
    const block: MarkdownBlock = { axId: "ax-2", markdown: "text", source: "context", modificationId: "gone" };

    expect(buildBlockPopoverModel(block, [])).toEqual({ kind: "actionable" });
  });

  it("truncates a long label the same way the review list does", () => {
    const longText = "x".repeat(120);
    const block: MarkdownBlock = { axId: "ax-2", markdown: longText, source: "context", modificationId: "m1" };
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: locator("t"), value: { text: longText } },
    ];

    const model = buildBlockPopoverModel(block, modifications);

    expect(model.kind).toBe("existing");
    if (model.kind === "existing") {
      expect(model.label.length).toBeLessThan(longText.length);
      expect(model.label.endsWith("…")).toBe(true);
    }
  });
});
