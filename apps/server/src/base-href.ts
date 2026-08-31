/**
 * Injects a <base href> so a fetched page's relative URLs — CSS, images,
 * links — resolve correctly when rendered outside their original origin,
 * in the human-view preview. Cheaper than rewriting every relative URL
 * in the document by hand (ADR: see BRIEF.md §7, human-view fidelity).
 */
export function injectBaseHref(document: Document, url: string): void {
  if (!document.head) {
    const head = document.createElement("head");
    document.documentElement.insertBefore(head, document.documentElement.firstChild);
  }

  document.querySelectorAll("head > base").forEach((el) => el.remove());

  const base = document.createElement("base");
  base.setAttribute("href", url);
  document.head.insertBefore(base, document.head.firstChild);
}
