/**
 * Inline text-formatting tags: elements that only ever appear as part of
 * an enclosing block's own text flow, never as content in their own
 * right. Everything else — <img>, <button>, <div>, <p>, headings, list
 * items, and so on — is treated as a valid attachment point regardless of
 * whether its own parent also happens to be block-level, which is what a
 * plain "climb until you hit a block tag" rule gets wrong: it would climb
 * straight past a lone <img> sitting directly under <body>.
 */
const INLINE_TEXT_TAGS = new Set([
  "span", "a", "b", "i", "em", "strong", "small", "sub", "sup", "abbr",
  "code", "mark", "cite", "q", "time", "u", "s", "strike", "kbd", "samp",
  "var", "bdi", "bdo",
]);

/**
 * Tags that agent-payload.ts's BLOCK_SELECTOR groups into a single
 * Markdown block, swallowing their entire subtree's text. A <button> or
 * <input> sitting inside one of these (a call to action inline in a
 * paragraph, say) is real content, not inline text formatting — but
 * anchoring a note there would still nest it inside the container's own
 * block, reproducing the merge this module exists to avoid. Kept in sync
 * with BLOCK_SELECTOR in agent-payload.ts (minus [data-ax-context] and
 * [data-ax-forward], which describe inserted nodes themselves, never
 * something a click could land inside and need to climb out of).
 */
const BLOCK_CONTAINER_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre",
  "td", "th", "dt", "dd", "figcaption",
]);

/**
 * Finds the outermost ancestor-or-self that agent-payload.ts would group
 * into one Markdown block, if any exists in the chain.
 */
function outermostBlockContainer(element: Element): Element | null {
  let current: Element = element;
  let outermost: Element | null = BLOCK_CONTAINER_TAGS.has(current.tagName.toLowerCase())
    ? current
    : null;
  while (current.parentElement) {
    current = current.parentElement;
    if (BLOCK_CONTAINER_TAGS.has(current.tagName.toLowerCase())) {
      outermost = current;
    }
  }
  return outermost;
}

/**
 * Walks up from an element to the nearest real content boundary. Used to
 * place a modification's inserted content — a context note, a forwarded
 * link's content — as a true sibling of that boundary, rather than as a
 * sibling of whatever element happened to be clicked. Selecting a page
 * always lands on the innermost element under the cursor (every element
 * carries an ax-id), so two cases need climbing past:
 *
 * - Purely inline text formatting (a styled title span, an anchor inside
 *   a sentence): inserting there directly would nest new content inside
 *   the enclosing block instead of beside it.
 * - Real content nested inside a paragraph-like container (a button or
 *   input used as an inline call to action): the container, not the
 *   element clicked, is what agent-payload.ts treats as one Markdown
 *   block, so anchoring inside it still silently merges the two.
 *
 * When any ancestor-or-self is one of those containers, the outermost
 * one wins — a nested li > p, say, is one block anchored at the li,
 * since agent-payload.ts's accepted-block logic keeps the outermost and
 * folds the rest in. Otherwise, fall back to skipping purely inline text
 * tags, which covers content with no containing block at all (a lone
 * <img> directly under <body>).
 */
export function nearestBlockAncestor(element: Element): Element {
  const container = outermostBlockContainer(element);
  if (container) return container;

  let current: Element = element;
  while (INLINE_TEXT_TAGS.has(current.tagName.toLowerCase())) {
    if (!current.parentElement) return current;
    current = current.parentElement;
  }
  return current;
}

/**
 * Places a single node beside a target's nearest block ancestor —
 * shared by every kind of appended content (a context note, forwarded
 * link content), which all follow the same rule and the same edge case:
 * never nested inside the block that would swallow it (nearestBlockAncestor
 * above), and never duplicated when the same target is re-applied.
 * document.body itself has no meaningful "next sibling" (its parent is
 * <html>), so it's the one anchor that gets a child instead of a sibling;
 * that's the fallback nearestBlockAncestor returns when nothing
 * block-level exists above the target at all.
 *
 * Two different modifications can share the same nearest block ancestor —
 * two links annotated inside one paragraph, say — so "re-applied" is
 * judged by the built node's own data-ax-id (derived from the *target*,
 * ax-id.ts), not by whatever merely happens to sit in the insertion slot:
 * checking only "does the next sibling carry markerAttr" would delete a
 * sibling modification's note the instant a second one lands at the same
 * anchor, since both use the same markerAttr.
 */
export function insertBesideBlockAncestor(
  document: Document,
  target: Element,
  markerAttr: string,
  buildNode: () => Element,
): void {
  const anchor = nearestBlockAncestor(target);
  const isBodyAnchor = anchor === document.body;
  const node = buildNode();
  const nodeAxId = node.getAttribute("data-ax-id");

  const siblings = isBodyAnchor
    ? Array.from(anchor.children)
    : anchor.parentElement
      ? Array.from(anchor.parentElement.children)
      : [];
  const priorInsertion = siblings.find(
    (sib) => sib.hasAttribute(markerAttr) && sib.getAttribute("data-ax-id") === nodeAxId,
  );
  priorInsertion?.remove();

  if (isBodyAnchor) {
    anchor.appendChild(node);
  } else {
    anchor.parentNode?.insertBefore(node, anchor.nextSibling);
  }
}
