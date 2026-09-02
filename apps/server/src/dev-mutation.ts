/**
 * Dev-only tool (NIM-54's last acceptance criterion): a real page won't
 * change shape on command, so drift, re-anchor, and stale resolution have
 * nothing to demonstrate against without a way to mutate a page deliberately.
 * Applied only to the in-memory copy the fixture-backed demo pages already
 * use (see FixtureStore.mutate) — never against a real fetched page.
 */
export type DevMutation =
  | { type: "move"; selector: string; toParentSelector: string; toIndex?: number }
  | { type: "edit"; selector: string; text: string }
  | { type: "insert"; parentSelector: string; html: string; atIndex?: number }
  | { type: "delete"; selector: string };

/**
 * Applies each mutation in order against a live document, in place. A
 * selector that matches nothing is skipped rather than thrown — the same
 * "don't crash the render seam over a stale reference" stance resolveLocator
 * takes, since this is meant to be poked at freely while demoing.
 */
export function applyDevMutations(document: Document, mutations: DevMutation[]): void {
  for (const mutation of mutations) {
    switch (mutation.type) {
      case "move": {
        const element = document.querySelector(mutation.selector);
        const parent = document.querySelector(mutation.toParentSelector);
        if (!element || !parent) continue;
        const ref =
          mutation.toIndex !== undefined && mutation.toIndex < parent.children.length
            ? parent.children[mutation.toIndex]
            : null;
        parent.insertBefore(element, ref);
        break;
      }
      case "edit": {
        const element = document.querySelector(mutation.selector);
        if (!element) continue;
        element.textContent = mutation.text;
        break;
      }
      case "insert": {
        const parent = document.querySelector(mutation.parentSelector);
        if (!parent) continue;
        const wrapper = document.createElement("div");
        wrapper.innerHTML = mutation.html;
        const ref =
          mutation.atIndex !== undefined && mutation.atIndex < parent.children.length
            ? parent.children[mutation.atIndex]
            : null;
        for (const node of Array.from(wrapper.childNodes)) {
          parent.insertBefore(node, ref);
        }
        break;
      }
      case "delete": {
        document.querySelector(mutation.selector)?.remove();
        break;
      }
    }
  }
}
