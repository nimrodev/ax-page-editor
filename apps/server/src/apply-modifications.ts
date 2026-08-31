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

export interface ModificationStatus {
  id: string;
  /**
   * "unresolved": the locator didn't resolve against this render's document
   * at all (drift, a genuinely removed element — see resolveLocator).
   * "shadowed": the locator resolved fine, but the element it found sits
   * inside another modification's hidden subtree, so it wasn't applied —
   * distinct from "unresolved" because the modification isn't broken, it's
   * just currently covered (NIM-52). Retained either way: never dropped
   * from the configuration just because this render couldn't apply it.
   * "applied": resolved, not shadowed, and its effect ran.
   */
  status: "applied" | "shadowed" | "unresolved";
}

/**
 * Applies a configuration's modifications to a prepared document, in
 * place, and reports what happened to each. Resolution happens in one
 * pass, against the document as fetched — before any hide has removed
 * anything — so a modification whose target sits inside a to-be-hidden
 * subtree is told apart from one whose locator plain doesn't resolve
 * (NIM-52): once an ancestor is actually removed, a descendant locator
 * can no longer be resolved at all, which is indistinguishable from drift
 * or staleness if resolution happens after the fact.
 *
 * Shadowing is a structural property of the final document, not a race
 * against submission order — a modification is shadowed by ANY hide
 * modification whose resolved element contains it, regardless of which
 * one was submitted first. That matches the mental model a publisher
 * actually has: hiding a section shadows an annotation inside it whether
 * the annotation was added before or after the hide.
 *
 * Async because forwardLink needs a real fetch; hide and context never
 * await, so a modification list without any forwardLink resolves
 * synchronously within this call despite the Promise-returning signature.
 * forwardCtx is optional so every existing caller — direct unit tests
 * exercising hide/context alone — keeps working unchanged; a forwardLink
 * modification with no context supplied is a no-op rather than a crash.
 */
export async function applyModifications(
  document: Document,
  modifications: Modification[],
  forwardCtx?: ForwardContext,
): Promise<ModificationStatus[]> {
  const deduped = dedupeModifications(modifications);
  const resolved = deduped.map((modification) => ({
    modification,
    element: resolveLocator(document, modification.target),
  }));

  const hideElements = resolved
    .filter((r) => r.modification.type === "hide" && r.element !== null)
    .map((r) => r.element as Element);

  const statuses: ModificationStatus[] = resolved.map(({ modification, element }) => {
    if (!element) return { id: modification.id, status: "unresolved" };
    // A hide can itself be shadowed by another hide (nested hidden
    // sections) — checked the same way as any other type, since applying
    // a redundant inner removal is harmless but reporting it as "applied"
    // would be misleading about what actually took effect. `hideEl !==
    // element` guards a hide against shadowing itself, since Element#contains
    // is true for an element and itself.
    const shadowed = hideElements.some((hideEl) => hideEl !== element && hideEl.contains(element));
    return { id: modification.id, status: shadowed ? "shadowed" : "applied" };
  });
  const statusById = new Map(statuses.map((s) => [s.id, s.status]));

  for (const { modification, element } of resolved) {
    if (!element || statusById.get(modification.id) === "shadowed") continue;

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

  return statuses;
}
