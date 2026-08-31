/**
 * Assigns a positional, in-session element handle to every element in the
 * document, in document order. Purely positional and never persisted (see
 * CONTEXT.md — ax-id); it exists only to let the agent payload and the
 * human-view preview refer to the same elements within one render.
 */
export function assignAxIds(document: Document): void {
  const elements = document.querySelectorAll("*");
  elements.forEach((el, index) => {
    el.setAttribute("data-ax-id", `ax-${index}`);
  });
}
