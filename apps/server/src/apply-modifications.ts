import { Modification } from "@ax/schema";
import { resolveLocator } from "./resolve-locator";
import { nearestBlockAncestor } from "./block-ancestor";

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
 * Inserted as the element's next sibling rather than as a child, since a
 * void element like <img> cannot have children. Using textContent rather
 * than innerHTML means the serializer escapes the publisher's text
 * automatically — no manual escaping to get wrong.
 *
 * Re-applying (edit, or re-annotating the same target) replaces the
 * existing note in place rather than inserting a second one, so this
 * function alone can't produce a duplicate even before
 * dedupeModifications runs.
 */
function applyContext(document: Document, target: Element, text: string): void {
  // Insert beside the nearest block-level ancestor, not beside whatever
  // was actually clicked — selection always lands on the innermost
  // element, and inserting there would nest the note inside that
  // element's own enclosing block, silently merging the two in the
  // agent payload instead of keeping them adjacent. See block-ancestor.ts.
  const anchor = nearestBlockAncestor(target);
  // document.body itself has no next sibling slot worth inserting into —
  // its parent is <html>, so inserting "beside" it the same way as any
  // other anchor would place the note outside <body> entirely. It's what
  // nearestBlockAncestor falls back to when nothing block-level exists
  // above the target at all, so the note becomes body's own last child
  // instead of one of its siblings.
  const isBodyAnchor = anchor === document.body;

  const existing = isBodyAnchor ? anchor.lastElementChild : anchor.nextElementSibling;
  if (existing && existing.hasAttribute("data-ax-context")) {
    existing.textContent = text;
    return;
  }

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
  if (isBodyAnchor) {
    anchor.appendChild(note);
  } else {
    anchor.parentNode?.insertBefore(note, anchor.nextSibling);
  }
}

/**
 * Applies a configuration's modifications to a prepared document, in
 * place. Link forwarding is a typed no-op here — its real implementation
 * is NIM-51 — so the same call site keeps working as it's filled in.
 */
export function applyModifications(document: Document, modifications: Modification[]): void {
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
        break;
    }
  }
}
