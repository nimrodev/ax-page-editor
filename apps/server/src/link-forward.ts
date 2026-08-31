import { JSDOM } from "jsdom";
import { PageFetcher, FetchFailure } from "./fetcher";
import { FetchBudget } from "./fetch-budget";
import { sanitizeDocument } from "./sanitizer";
import { buildAgentPayload } from "./agent-payload";
import { insertBesideBlockAncestor } from "./block-ancestor";

const DEFAULT_CHAR_BUDGET = 4000;

export type ForwardResult =
  | { kind: "content"; markdown: string; sourceUrl: string; truncated: boolean }
  | { kind: "unsupported"; sourceUrl: string }
  | { kind: "error"; sourceUrl: string; message: string }
  | { kind: "self" }
  | { kind: "budget-exceeded"; sourceUrl: string };

/**
 * Caches a forwarded destination's extracted content by normalized URL,
 * for the lifetime of the process instance holding it. Unlike the target
 * page itself — intentionally never cached, ADR-0001, since a stored copy
 * would rot silently — a forwarded destination is only ever consulted for
 * its own sake, so re-fetching it on every preview while a publisher
 * iterates on an unrelated part of the page buys nothing.
 */
export class ForwardLinkCache {
  private readonly entries = new Map<string, Promise<ForwardResult>>();

  getOrFetch(url: string, fetchFn: () => Promise<ForwardResult>): Promise<ForwardResult> {
    const existing = this.entries.get(url);
    if (existing) return existing;
    const promise = fetchFn();
    this.entries.set(url, promise);
    return promise;
  }
}

/**
 * Tracks a shared character budget across every forwarded link in one
 * render — "total... per render" (NIM-51), not per link, so ten small
 * forwards and one huge one draw from the same pool.
 */
export class ForwardCharBudget {
  private remaining: number;

  constructor(max: number = DEFAULT_CHAR_BUDGET) {
    this.remaining = max;
  }

  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  take(chars: number): number {
    const allowed = Math.max(0, Math.min(chars, this.remaining));
    this.remaining -= allowed;
    return allowed;
  }
}

export interface ForwardContext {
  /** The page currently being rendered, for self-link detection. */
  pageUrl: string;
  fetcher: PageFetcher;
  budget: FetchBudget;
  cache: ForwardLinkCache;
  charBudget: ForwardCharBudget;
}

/**
 * Strips the fragment and a trailing slash before comparing two URLs for
 * self-link detection — "/page" and "/page/" are the same destination in
 * practice, and treating them as different would send a self-link
 * through a real fetch instead of being skipped.
 */
function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

/**
 * Cuts text to at most maxLength characters, backing up to the last word
 * boundary rather than splitting mid-word — "cut at a boundary" (NIM-51).
 * Falls back to a hard cut only when there's no boundary to back up to
 * (a single word longer than the whole budget).
 */
function truncateAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const boundary = slice.lastIndexOf(" ");
  return boundary > 0 ? slice.slice(0, boundary) : slice;
}

/**
 * Fetches a destination through the same guard and budget as the target
 * page (NIM-51's "same guard" requirement), sanitizes it identically, and
 * extracts its Markdown content the same way the primary payload does —
 * one level only: this fragment is never itself scanned for forwardLink
 * modifications, which is what keeps forwarding from chaining.
 */
async function fetchForwardedContent(
  url: string,
  fetcher: PageFetcher,
  budget: FetchBudget,
): Promise<ForwardResult> {
  try {
    const { html } = await fetcher.fetch(url, budget);
    const dom = new JSDOM(html);
    sanitizeDocument(dom.window.document);
    // ax-ids assigned here are purely local to this throwaway document —
    // buildAgentPayload's block emitter requires one per element to emit
    // a block at all, but none of these ids are ever compared against or
    // exposed alongside the target page's own.
    dom.window.document.querySelectorAll("*").forEach((el, i) => el.setAttribute("data-ax-id", `fwd-${i}`));
    const { markdownBlocks } = buildAgentPayload(dom.window.document);
    const markdown = markdownBlocks.map((b) => b.markdown).join("\n\n");
    return { kind: "content", markdown, sourceUrl: url, truncated: false };
  } catch (err) {
    if (err instanceof FetchFailure && err.reason === "unsupported-content-type") {
      return { kind: "unsupported", sourceUrl: url };
    }
    if (err instanceof FetchFailure) {
      return { kind: "error", sourceUrl: url, message: err.message };
    }
    throw err;
  }
}

function renderForwardNode(document: Document, result: ForwardResult): Element {
  const node = document.createElement("div");
  node.setAttribute("data-ax-forward", "");

  switch (result.kind) {
    case "content": {
      node.setAttribute("data-ax-forward-kind", "content");
      const sourceLine = document.createElement("p");
      const link = document.createElement("a");
      link.setAttribute("href", result.sourceUrl);
      link.textContent = result.sourceUrl;
      sourceLine.append("From: ", link);
      node.appendChild(sourceLine);

      const body = document.createElement("p");
      body.textContent = result.truncated ? `${result.markdown} (truncated)` : result.markdown;
      node.appendChild(body);

      // Markdown has no closing tag the way the HTML payload's
      // </div data-ax-forward>` naturally has one — without an explicit
      // marker, a reader (or an agent) can't tell where forwarded content
      // stops and the target page's own next block resumes, especially
      // when the content wasn't truncated and "(truncated)" isn't there
      // to double as an end signal.
      const endMarker = document.createElement("p");
      endMarker.textContent = "— End of forwarded content —";
      node.appendChild(endMarker);
      break;
    }
    case "unsupported":
      node.setAttribute("data-ax-forward-kind", "unsupported");
      node.textContent = `Linked content at ${result.sourceUrl} is not a web page, so it was not shown.`;
      break;
    case "error":
      node.setAttribute("data-ax-forward-kind", "error");
      node.textContent = `Could not load the linked content from ${result.sourceUrl}: ${result.message}`;
      break;
    case "self":
      node.setAttribute("data-ax-forward-kind", "self");
      node.textContent = "This link points to the current page, so it was not forwarded.";
      break;
    case "budget-exceeded":
      node.setAttribute("data-ax-forward-kind", "budget-exceeded");
      node.textContent = `Linked content from ${result.sourceUrl} was omitted: this render's character budget was already spent.`;
      break;
  }
  return node;
}

/**
 * Places (or replaces) the forwarded-content node beside the anchor's
 * containing block — the same placement rule as a context note, and for
 * the same reason: inserting where the link itself sits would nest
 * thousands of words inside the sentence that held it. Shared with
 * apply-modifications.ts's applyContext via insertBesideBlockAncestor.
 */
function insertForwardNode(document: Document, target: Element, result: ForwardResult): void {
  insertBesideBlockAncestor(document, target, "data-ax-forward", () => {
    const node = renderForwardNode(document, result);
    const targetAxId = target.getAttribute("data-ax-id");
    if (targetAxId) {
      node.setAttribute("data-ax-id", `${targetAxId}-forward`);
    }
    return node;
  });
}

export async function applyForwardLink(
  document: Document,
  anchor: Element,
  value: { href: string; maxChars?: number },
  ctx: ForwardContext,
): Promise<void> {
  let destination: string;
  try {
    destination = normalizeUrl(new URL(value.href, ctx.pageUrl).toString());
  } catch {
    insertForwardNode(document, anchor, { kind: "error", sourceUrl: value.href, message: "Not a valid URL." });
    return;
  }

  if (destination === normalizeUrl(ctx.pageUrl)) {
    insertForwardNode(document, anchor, { kind: "self" });
    return;
  }

  if (ctx.charBudget.exhausted) {
    insertForwardNode(document, anchor, { kind: "budget-exceeded", sourceUrl: destination });
    return;
  }

  const result = await ctx.cache.getOrFetch(destination, () =>
    fetchForwardedContent(destination, ctx.fetcher, ctx.budget),
  );

  if (result.kind !== "content") {
    insertForwardNode(document, anchor, result);
    return;
  }

  // The per-link cap (value.maxChars) and the render-wide pool
  // (ctx.charBudget) are two independent limits — a link can ask for less
  // than its share, but never more than what's left in the pool.
  const wanted = value.maxChars === undefined ? result.markdown.length : Math.min(value.maxChars, result.markdown.length);
  const allowed = ctx.charBudget.take(wanted);
  const truncated = allowed < result.markdown.length;

  insertForwardNode(document, anchor, {
    ...result,
    markdown: truncated ? truncateAtBoundary(result.markdown, allowed) : result.markdown,
    truncated,
  });
}
