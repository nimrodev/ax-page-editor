import { JSDOM } from "jsdom";

/**
 * Strips embedded whitespace and control characters before comparing a
 * javascript: URL, so obfuscation like "jav\tascript:" or a literal
 * newline mid-scheme doesn't slip past a plain prefix check.
 */
function isJavascriptUrl(value: string): boolean {
  const stripped = value.replace(/[\s\x00-\x1F]/g, "");
  return stripped.toLowerCase().startsWith("javascript:");
}

/**
 * Applies the sanitization rules to one DOM root, then recurses into any
 * <template> elements found within it. A <template>'s content lives in a
 * separate DocumentFragment that querySelectorAll on the main document
 * never walks into, but that fragment is still part of what dom.serialize()
 * writes back out — so an unsanitized <script> inside a <template> would
 * otherwise survive into the output untouched.
 */
function sanitizeRoot(root: ParentNode): void {
  root.querySelectorAll("script").forEach((el) => el.remove());
  root.querySelectorAll("iframe").forEach((el) => el.remove());
  root.querySelectorAll("form").forEach((el) => el.removeAttribute("action"));

  root.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (isJavascriptUrl(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  root.querySelectorAll("template").forEach((template) => {
    sanitizeRoot((template as HTMLTemplateElement).content);
  });
}

/**
 * Strips the vectors that would let fetched third-party markup script
 * against the host application or exfiltrate through a live form: script
 * tags, event-handler attributes, javascript: URLs, form actions, and
 * nested iframes — including inside <template> content. Security only:
 * this is shared by both the agent payload and the human-view preview,
 * so it deliberately leaves <style>, images, and the page's own structure
 * intact — a human preview needs to look like the page. Noise-stripping
 * for the agent payload specifically lives in agent-payload.ts instead.
 * Mutates in place, so a pipeline that already holds a parsed document
 * doesn't pay for a second parse.
 */
export function sanitizeDocument(document: Document): void {
  sanitizeRoot(document);
}

/** String-in, string-out convenience wrapper around sanitizeDocument. */
export function sanitizeHtml(html: string): string {
  const dom = new JSDOM(html);
  sanitizeDocument(dom.window.document);
  return dom.serialize();
}
