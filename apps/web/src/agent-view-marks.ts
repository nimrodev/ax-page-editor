import { MarkdownBlock } from "./api";

// The non-"page" half of MarkdownBlock's source union — a marked segment
// can never be plain page content by definition, so this is a genuine
// subset, not a second independent vocabulary to keep in sync by hand.
export type MarkerKind = Exclude<MarkdownBlock["source"], "page">;

export interface HtmlSegment {
  text: string;
  markerKind?: MarkerKind;
  axId?: string;
}

// Matches an opening tag carrying data-ax-context or data-ax-forward
// anywhere among its attributes, regardless of attribute order — the
// server sets its own marker attribute first and data-ax-id after, but
// nothing here should depend on that staying true. The attribute-scanning
// groups — (?:[^>"']|"[^"]*"|'[^']*')* — deliberately don't stop at a
// bare ">": data-ax-mod-id's value is a CSS path locator (e.g.
// "context:html>body>div"), which contains literal ">" characters inside
// its own quotes. A naive [^>]* stops at the first one, silently
// truncating the match before data-ax-id (set last) and losing it.
const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const MARKER_TAG = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b${ATTRS}\\bdata-ax-(context|forward)\\b${ATTRS}>`, "g");
const AX_ID_ATTR = /data-ax-id="([^"]*)"/;

/**
 * Finds the index just past the close tag that matches the marker's own
 * opening tag, given only the tag name — apply-modifications.ts and
 * link-forward.ts both build these nodes (a bare <span> for a context
 * note, a <div> of <p>/<a> children for forwarded content) without ever
 * nesting another element of the *same* tag name inside, so counting
 * same-name open/close tags is enough to find the right close without a
 * full HTML parse. Falls back to the end of the string for malformed
 * input rather than looping forever.
 */
function findMatchingCloseTagEnd(html: string, searchFrom: number, tagName: string): number {
  const openTag = new RegExp(`<${tagName}\\b`, "g");
  const closeTag = new RegExp(`</${tagName}>`, "g");
  let depth = 1;
  let pos = searchFrom;

  while (depth > 0) {
    openTag.lastIndex = pos;
    closeTag.lastIndex = pos;
    const nextOpen = openTag.exec(html);
    const nextClose = closeTag.exec(html);
    if (!nextClose) return html.length;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return pos;
}

/**
 * Splits raw HTML source text into segments so the HTML tab can highlight
 * a whole modification-added element (NIM-63) — open tag through its
 * matching close tag, so the publisher's actual note or forwarded content
 * gets the color, not just the opening tag's markup — without re-parsing
 * the document into a live DOM: this operates on the exact string the
 * agent would receive, so what's rendered can never drift from what's
 * actually delivered.
 */
export function splitHtmlByMarkers(html: string): HtmlSegment[] {
  const segments: HtmlSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MARKER_TAG.lastIndex = 0;
  while ((match = MARKER_TAG.exec(html))) {
    if (match.index > lastIndex) {
      segments.push({ text: html.slice(lastIndex, match.index) });
    }
    const openTag = match[0];
    const tagName = match[1];
    const elementEnd = findMatchingCloseTagEnd(html, match.index + openTag.length, tagName);
    segments.push({
      text: html.slice(match.index, elementEnd),
      markerKind: match[2] === "context" ? "context" : "forwarded",
      axId: AX_ID_ATTR.exec(openTag)?.[1],
    });
    lastIndex = elementEnd;
    MARKER_TAG.lastIndex = elementEnd;
  }
  if (lastIndex < html.length) {
    segments.push({ text: html.slice(lastIndex) });
  }
  return segments;
}

/**
 * Wraps an index into [0, length) in both directions — "previous" from
 * index 0 lands on the last item, "next" from the last item lands on 0 —
 * so the jump-to-change navigator (NIM-63) can walk prev/next without its
 * own bounds-checking. `length` <= 0 always returns 0, since there is
 * nothing to index into.
 */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
