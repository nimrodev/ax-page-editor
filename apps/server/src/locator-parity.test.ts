import { describe, expect, it } from "@jest/globals";
import { JSDOM } from "jsdom";
import { buildLocator } from "@ax/schema";
import { IFRAME_OVERLAY_SCRIPT } from "../../web/src/iframe-overlay";

/**
 * apps/web/src/iframe-overlay.ts hand-duplicates packages/schema's locator
 * algorithm in plain JS, because a sandboxed iframe's srcdoc cannot import
 * a module (see that file's header comment). This test is the guard the
 * comment promises but doesn't enforce on its own: it imports the real,
 * compiled IFRAME_OVERLAY_SCRIPT constant — not a re-read of the raw .ts
 * source, which would bypass TypeScript's own string-escape processing
 * and produce a regex that looks right in the file but isn't what
 * actually runs — and evaluates it against the same elements buildLocator
 * sees, so the two silently drifting apart fails a test here, rather than
 * surfacing only as a hide that mysteriously never resolves server-side.
 */
function extractClientBuildLocator(): (el: Element) => unknown {
  const scriptBody = IFRAME_OVERLAY_SCRIPT.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!scriptBody) throw new Error("Could not find the overlay's <script> body");

  // Everything this test needs (buildLocator and its own helpers) is
  // defined before the script starts registering listeners — the message
  // listener, the overlay-ready ping, and the click/keydown listeners
  // that follow it all reference `window`/`document` at the top level
  // (not deferred inside a function body), which breaks Node's `vm` eval
  // outside a real DOM. Truncating the script at the first listener
  // registration drops all of that in one place, rather than needing a
  // fragile regex to strip each new top-level listener as it's added.
  const messageListenerStart = scriptBody.indexOf('window.addEventListener("message"');
  const withoutListeners = messageListenerStart === -1 ? scriptBody : scriptBody.slice(0, messageListenerStart);
  const withoutIife = withoutListeners.replace(/^\s*\(function \(\) \{/, "");
  const exposed = withoutIife + "\nmodule.exports.buildLocator = buildLocator;";

  const sandbox = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("module", exposed)(sandbox);
  return sandbox.exports.buildLocator as (el: Element) => unknown;
}

describe("client/server locator parity", () => {
  const clientBuildLocator = extractClientBuildLocator();

  it.each([
    ["a link", '<body><a href="/one">Learn more</a></body>', "a"],
    ["a paragraph with irregular whitespace", "<body><p>Hello   world\n  test</p></body>", "p"],
    ["an image", '<body><img src="/logo.png"></body>', "img"],
    ["a same-tag sibling", "<body><div><p>one</p><p>two</p></div></body>", "div > p:nth-of-type(2)"],
  ])("produces identical output to the server for %s", (_label, html, selector) => {
    const dom = new JSDOM(html);
    const el = dom.window.document.querySelector(selector)!;

    const clientResult = clientBuildLocator(el);
    const serverResult = buildLocator(el);

    expect(clientResult).toEqual(serverResult);
  });
});
