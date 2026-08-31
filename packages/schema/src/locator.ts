import type { Locator } from "./index";

const TEXT_HINT_MAX_LENGTH = 120;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A small, dependency-free, deterministic string hash (FNV-1a) rather than
 * a cryptographic digest. The fingerprint only needs to behave — same
 * input, same output, different meaningful input, different output — not
 * resist attack, and this runs identically in the browser and in Node with
 * no imports, which a real hash (Node's crypto, or async SubtleCrypto)
 * would not: a locator is built client-side, at the moment of selection,
 * and re-verified server-side against a freshly re-fetched page (ADR-0001)
 * — the two must compute it exactly the same way, synchronously.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The structural half of a locator: the chain of tag names from the
 * document root to this element, each disambiguated with :nth-of-type
 * only when it has same-tag siblings. See CONTEXT.md — Locator.
 */
function buildPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (el) => el.tagName === current!.tagName,
        )
      : [current];

    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${tag}:nth-of-type(${index})`);
    } else {
      segments.unshift(tag);
    }

    current = current.parentElement;
  }

  return segments.join(">");
}

/**
 * The content half of a locator: identity that survives a structural move,
 * used to re-anchor a modification when its path no longer resolves. Tag,
 * normalized text, and href/src so two visually identical elements
 * pointing at different destinations don't collide.
 */
function buildFingerprint(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const text = normalizeText(element.textContent ?? "");
  const href = element.getAttribute("href") ?? "";
  const src = element.getAttribute("src") ?? "";

  return fnv1a(`${tag}|${text}|${href}|${src}`);
}

function buildTextHint(element: Element): string {
  const text = normalizeText(element.textContent ?? "");
  return text.length > TEXT_HINT_MAX_LENGTH ? text.slice(0, TEXT_HINT_MAX_LENGTH) : text;
}

/**
 * Builds the locator a modification attaches to: structural path, content
 * fingerprint, and a human-readable hint. See ADR-0003. Shared between
 * server (resolution) and browser (construction at selection time) —
 * see apps/web/src/iframe-overlay.ts, which duplicates this exact
 * algorithm in plain JS since a sandboxed iframe's srcdoc cannot import
 * a module. Keep the two in sync.
 */
export function buildLocator(element: Element): Locator {
  return {
    path: buildPath(element),
    fingerprint: buildFingerprint(element),
    textHint: buildTextHint(element),
  };
}
