import { describe, expect, it } from "vitest";
import { splitHtmlByMarkers, wrapIndex } from "./agent-view-marks";

describe("splitHtmlByMarkers", () => {
  it("returns the whole string as one plain segment when there are no markers", () => {
    const html = "<body><p>Hello</p></body>";
    expect(splitHtmlByMarkers(html)).toEqual([{ text: html }]);
  });

  // Highlighting just the opening tag (the original behavior) colored a
  // fragment of raw markup — <span data-ax-context ...> — rather than the
  // publisher's actual note text, which sits *after* that tag and so
  // rendered as plain, unhighlighted text right next to it. The whole
  // point of coloring a modification is to make its content findable;
  // the segment now runs through the matching close tag so the note text
  // itself is what gets the color.
  it("splits out a context note's whole element — open tag through its matching close tag — as one segment", () => {
    const html = '<p>Before</p><span data-ax-context="" data-ax-id="ax-3-context">Note text</span><p>After</p>';

    const segments = splitHtmlByMarkers(html);

    expect(segments).toEqual([
      { text: "<p>Before</p>" },
      {
        text: '<span data-ax-context="" data-ax-id="ax-3-context">Note text</span>',
        markerKind: "context",
        axId: "ax-3-context",
      },
      { text: "<p>After</p>" },
    ]);
  });

  it("finds the matching close tag past nested elements of a different tag name", () => {
    const html = '<div data-ax-forward="" data-ax-id="b"><p>From: <a href="x">x</a></p><p>Body</p></div><p>After</p>';

    const segments = splitHtmlByMarkers(html);

    expect(segments).toEqual([
      {
        text: '<div data-ax-forward="" data-ax-id="b"><p>From: <a href="x">x</a></p><p>Body</p></div>',
        markerKind: "forwarded",
        axId: "b",
      },
      { text: "<p>After</p>" },
    ]);
  });

  it("marks a segment without a matching data-ax-id as having no axId, rather than throwing", () => {
    const html = '<span data-ax-context="">Note</span>';

    const segments = splitHtmlByMarkers(html);

    expect(segments[0]).toEqual({
      text: '<span data-ax-context="">Note</span>',
      markerKind: "context",
      axId: undefined,
    });
  });

  it("handles multiple markers in the same document", () => {
    const html =
      '<span data-ax-context="" data-ax-id="a">X</span><div data-ax-forward="" data-ax-id="b"><p>Y</p></div>';

    const segments = splitHtmlByMarkers(html);
    const kinds = segments.filter((s) => s.markerKind).map((s) => s.markerKind);

    expect(kinds).toEqual(["context", "forwarded"]);
    expect(segments.map((s) => s.text).join("")).toBe(html);
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
