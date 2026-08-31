import { Modification } from "@ax/schema";
import { resolveLocator } from "./resolve-locator";

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
 * Applies a configuration's modifications to a prepared document, in
 * place. Only "hide" is implemented — context and link forwarding land
 * in later slices and are deliberately no-ops here rather than errors,
 * so the same call site keeps working as they're filled in.
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
      case "forwardLink":
        break;
    }
  }
}
