import TurndownService from "turndown";

export interface MarkdownBlock {
  axId: string;
  markdown: string;
}

export interface AgentPayload {
  markdownBlocks: MarkdownBlock[];
  html: string;
}

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, dt, dd, figcaption";

const turndown = new TurndownService({ headingStyle: "atx" });

/**
 * Splits a sanitized, ax-id-annotated document into the two agent-facing
 * representations: an ordered array of Markdown blocks, each carrying the
 * ax-id of the element it came from, and the cleaned HTML for the whole
 * document. Emitting Markdown as blocks — not one joined string — is what
 * lets later slices highlight one block without re-parsing Markdown syntax.
 */
export function buildAgentPayload(document: Document): AgentPayload {
  const candidates = Array.from(document.querySelectorAll(BLOCK_SELECTOR));
  const accepted: Element[] = [];

  for (const candidate of candidates) {
    const hasAcceptedAncestor = accepted.some((el) => el.contains(candidate));
    if (!hasAcceptedAncestor) {
      accepted.push(candidate);
    }
  }

  const markdownBlocks: MarkdownBlock[] = [];
  for (const el of accepted) {
    const markdown = turndown.turndown(el.innerHTML).trim();
    if (markdown.length === 0) continue;

    const axId = el.getAttribute("data-ax-id");
    if (!axId) continue;

    markdownBlocks.push({ axId, markdown });
  }

  return {
    markdownBlocks,
    html: document.documentElement.outerHTML,
  };
}
