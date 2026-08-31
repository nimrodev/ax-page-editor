import { Modification } from "@ax/schema";
import { resolveLocator } from "./resolve-locator";
import { insertBesideBlockAncestor } from "./block-ancestor";
import { applyForwardLink, ForwardContext } from "./link-forward";

/**
 * Collapses a modification list to at most one entry per (target path,
 * type), keeping the last submission for each key. This is what makes
 * "apply the same modification twice" an update rather than a
 * duplication a property of the render seam itself — not a convention a
 * caller has to remember to uphold (see CONTEXT.md — Configuration).
 */
export function dedupeModifications(modifications: Modification[]): Modification[] {
  const byKey = new Map<string, Modification>();
  for (const modification of modifications) {
    byKey.set(`${modification.type}:${modification.target.path}`, modification);
  }
  return Array.from(byKey.values());
}

/**
 * A context note is a real, parseable text node adjacent to its element —
 * never an attribute alone, an HTML comment, or an ARIA property, all of
 * which an agent that flattens a page to text would lose (ADR-0004).
 * Placement (beside the nearest block ancestor, upserted rather than
 * duplicated on re-apply) is shared with forwarded link content — see
 * insertBesideBlockAncestor in block-ancestor.ts. Using textContent
 * rather than innerHTML means the serializer escapes the publisher's
 * text automatically — no manual escaping to get wrong.
 */
function applyContext(document: Document, target: Element, text: string): void {
  insertBesideBlockAncestor(document, target, "data-ax-context", () => {
    const note = document.createElement("span");
    note.setAttribute("data-ax-context", "");
    // buildAgentPayload only emits a Markdown block for elements carrying
    // data-ax-id, assigned once before any modification runs. Derive the
    // note's id from the originally targeted element rather than the
    // anchor: assignAxIds does cover document.body too in the real render
    // pipeline, but deriving from target keeps this correct regardless of
    // what nearestBlockAncestor resolves to (including hand-built documents
    // in tests that skip ax-id assignment altogether).
    const targetAxId = target.getAttribute("data-ax-id");
    if (targetAxId) {
      note.setAttribute("data-ax-id", `${targetAxId}-context`);
    }
    note.textContent = text;
    return note;
  });
}

/**
 * Applies a configuration's modifications to a prepared document, in
 * place, in submission order — which matters when a hide and a
 * forwardLink target elements in the same subtree: an earlier hide can
 * remove a later modification's target before resolveLocator ever sees
 * it, and the later modification is silently skipped like any other
 * unresolved locator. Async because forwardLink needs a real fetch;
 * hide and context never await, so a modification list without any
 * forwardLink resolves synchronously within this call despite the
 * Promise-returning signature.
 *
 * forwardCtx is optional so every existing caller — direct unit tests
 * exercising hide/context alone — keeps working unchanged; a forwardLink
 * modification with no context supplied is a no-op rather than a crash.
 */
export async function applyModifications(
  document: Document,
  modifications: Modification[],
  forwardCtx?: ForwardContext,
): Promise<void> {
  for (const modification of dedupeModifications(modifications)) {
    const element = resolveLocator(document, modification.target);
    if (!element) continue;

    switch (modification.type) {
      case "hide":
        element.remove();
        break;
      case "context":
        applyContext(document, element, modification.value.text);
        break;
      case "forwardLink":
        if (forwardCtx) {
          await applyForwardLink(document, element, modification.value, forwardCtx);
        }
        break;
    }
  }
}
