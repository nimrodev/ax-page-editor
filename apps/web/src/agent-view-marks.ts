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
// nothing here should depend on that staying true.
const MARKER_TAG = /<[a-zA-Z][^>]*\bdata-ax-(context|forward)\b[^>]*>/g;
const AX_ID_ATTR = /data-ax-id="([^"]*)"/;

/**
 * Splits raw HTML source text into segments so the HTML tab can highlight
 * just the opening tags that carry a modification marker (NIM-63), without
 * re-parsing the document into a live DOM — this operates on the exact
 * string the agent would receive, so what's rendered can never drift from
 * what's actually delivered.
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
    const tag = match[0];
    segments.push({
      text: tag,
      markerKind: match[1] === "context" ? "context" : "forwarded",
      axId: AX_ID_ATTR.exec(tag)?.[1],
    });
    lastIndex = match.index + tag.length;
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
