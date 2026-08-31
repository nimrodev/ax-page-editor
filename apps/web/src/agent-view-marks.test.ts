import { describe, expect, it } from "vitest";
import { splitHtmlByMarkers, wrapIndex } from "./agent-view-marks";

describe("splitHtmlByMarkers", () => {
  it("returns the whole string as one plain segment when there are no markers", () => {
    const html = "<body><p>Hello</p></body>";
    expect(splitHtmlByMarkers(html)).toEqual([{ text: html }]);
  });

  it("splits out a context-note tag as its own segment, extracting its ax-id", () => {
    const html = '<p>Before</p><span data-ax-context="" data-ax-id="ax-3-context">Note text</span><p>After</p>';

    const segments = splitHtmlByMarkers(html);

    expect(segments).toEqual([
      { text: "<p>Before</p>" },
      { text: '<span data-ax-context="" data-ax-id="ax-3-context">', markerKind: "context", axId: "ax-3-context" },
      { text: "Note text</span><p>After</p>" },
    ]);
  });

  it("splits out a forwarded-content tag regardless of attribute order", () => {
    const html = '<div data-ax-id="ax-7-forward" data-ax-forward-kind="content" data-ax-forward="">';

    const segments = splitHtmlByMarkers(html);

    expect(segments).toEqual([
      {
        text: html,
        markerKind: "forwarded",
        axId: "ax-7-forward",
      },
    ]);
  });

  it("marks a segment without a matching data-ax-id as having no axId, rather than throwing", () => {
    const html = '<span data-ax-context="">Note</span>';

    const segments = splitHtmlByMarkers(html);

    expect(segments[0]).toEqual({ text: '<span data-ax-context="">', markerKind: "context", axId: undefined });
  });

  it("handles multiple markers in the same document", () => {
    const html =
      '<span data-ax-context="" data-ax-id="a">X</span><div data-ax-forward="" data-ax-id="b">Y</div>';

    const segments = splitHtmlByMarkers(html);
    const kinds = segments.filter((s) => s.markerKind).map((s) => s.markerKind);

    expect(kinds).toEqual(["context", "forwarded"]);
  });
});

describe("wrapIndex", () => {
  it("returns the index unchanged when already in range", () => {
    expect(wrapIndex(2, 5)).toBe(2);
  });

  it("wraps 'previous' from the first item to the last", () => {
    expect(wrapIndex(-1, 5)).toBe(4);
  });

  it("wraps 'next' from the last item to the first", () => {
    expect(wrapIndex(5, 5)).toBe(0);
  });

  it("returns 0 for a length of zero, rather than dividing by zero", () => {
    expect(wrapIndex(3, 0)).toBe(0);
    expect(wrapIndex(-3, 0)).toBe(0);
  });

  it("wraps an index more than one length past the end", () => {
    expect(wrapIndex(7, 3)).toBe(1);
    expect(wrapIndex(-7, 3)).toBe(2);
  });
});
