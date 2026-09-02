import { describe, expect, it, jest } from "@jest/globals";
import { JSDOM } from "jsdom";
import { buildLocator, Modification } from "@ax/schema";
import { applyModifications, dedupeModifications } from "./apply-modifications";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { ForwardLinkCache, ForwardCharBudget, ForwardContext } from "./link-forward";

function documentFrom(html: string) {
  return new JSDOM(html).window.document;
}

function allowAllGuard() {
  return new SsrfGuard({ resolveHost: async () => ["93.184.216.34"] });
}

function htmlResponse(body: string) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function fetcherFor(routes: Record<string, () => Response>) {
  const fetchImpl = jest.fn(async (url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  });
  return new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch });
}

function contextFor(pageUrl: string, fetcher: PageFetcher): ForwardContext {
  return { pageUrl, fetcher, budget: new FetchBudget(), cache: new ForwardLinkCache(), charBudget: new ForwardCharBudget() };
}

describe("applyModifications", () => {
  it("removes the element and its entire subtree for a hide modification", () => {
    const document = documentFrom(
      "<body><nav><ul><li><a href='/a'>A</a></li><li><a href='/b'>B</a></li></ul></nav><main><p>Keep me</p></main></body>",
    );
    const nav = document.querySelector("nav")!;
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: buildLocator(nav) },
    ];

    applyModifications(document, modifications);

    expect(document.querySelector("nav")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
    expect(document.body.innerHTML).not.toContain("A");
    expect(document.body.innerHTML).not.toContain("B");
    expect(document.querySelector("p")!.textContent).toBe("Keep me");
  });

  it("skips a modification whose locator does not resolve, without throwing", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const fakeLocator = { path: "html>body>p:nth-of-type(9)", fingerprint: "x", textHint: "x" };
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: fakeLocator },
    ];

    expect(() => applyModifications(document, modifications)).not.toThrow();
    expect(document.querySelector("p")!.textContent).toBe("Hello");
  });

  it("applies multiple hide modifications independently", () => {
    const document = documentFrom("<body><header>H</header><p>Keep</p><footer>F</footer></body>");
    const header = document.querySelector("header")!;
    const footer = document.querySelector("footer")!;
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: buildLocator(header) },
      { id: "m2", type: "hide", target: buildLocator(footer) },
    ];

    applyModifications(document, modifications);

    expect(document.querySelector("header")).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
    expect(document.querySelector("p")!.textContent).toBe("Keep");
  });

  it("does nothing for forwardLink when no forward context is supplied", async () => {
    // applyModifications's forward context is optional so every existing
    // caller here — hide/context tests with no fetcher to speak of — keeps
    // working unchanged. Real forwardLink behavior is exercised in
    // link-forward.test.ts and render-page.test.ts, where a context is
    // actually supplied.
    const document = documentFrom("<body><a href='/x'>link</a></body>");
    const target = buildLocator(document.querySelector("a")!);
    const modifications: Modification[] = [
      { id: "m1", type: "forwardLink", target, value: { href: "https://example.com/x" } },
    ];

    await expect(applyModifications(document, modifications)).resolves.not.toThrow();
    expect(document.querySelector("a")).not.toBeNull();
    expect(document.querySelector("[data-ax-context]")).toBeNull();
    expect(document.querySelector("[data-ax-forward]")).toBeNull();
  });

  // NIM-54 — drift and re-anchor no longer mean "skip"; only a genuinely
  // stale locator does. "Drift behaves per type" (acceptance criteria):
  // hide applies silently regardless of which of the three non-stale
  // tiers resolved it — there's no editorial state a hidden element could
  // need to review.
  it("applies hide silently when the target has drifted (same position, different content)", async () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Old text</p></main></body>");
    const locator = buildLocator(document.querySelector("p")!);
    document.querySelector("p")!.textContent = "New text";
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator }];

    const statuses = await applyModifications(document, modifications);

    expect(statuses).toEqual([{ id: "m1", status: "applied" }]);
    expect(document.querySelector("p")).toBeNull();
  });

  it("applies hide at its new position when the target has re-anchored", async () => {
    const document = documentFrom("<body><main><article><p>Move me</p></article></main></body>");
    const locator = buildLocator(document.querySelector("p")!);
    const moved = documentFrom("<body><aside><p>Move me</p></aside></body>");
    const modifications: Modification[] = [{ id: "m1", type: "hide", target: locator }];

    const statuses = await applyModifications(moved, modifications);

    expect(statuses).toEqual([{ id: "m1", status: "applied" }]);
    expect(moved.querySelector("p")).toBeNull();
  });

  // CONTEXT.md — Needs review: "A context note applied to an element
  // whose content has drifted underneath it." Re-anchor is deliberately
  // excluded — the fingerprint still matched, so the note's original
  // content is intact, just relocated; only drift (same slot, changed
  // fingerprint) puts the note's continued relevance in doubt.
  it("flags a context note as needing review when its target has drifted", async () => {
    const document = documentFrom("<body><main><h1>Title</h1><p>Old text</p></main></body>");
    const locator = buildLocator(document.querySelector("p")!);
    document.querySelector("p")!.textContent = "New text";
    const modifications: Modification[] = [{ id: "m1", type: "context", target: locator, value: { text: "A note" } }];

    const statuses = await applyModifications(document, modifications);

    expect(statuses).toEqual([{ id: "m1", status: "applied", needsReview: true }]);
    // Still applied — needs-review is editorial, not a reason to withhold it.
    expect(document.querySelector("[data-ax-context]")).not.toBeNull();
  });

  it("does not flag a re-anchored context note as needing review", async () => {
    const document = documentFrom("<body><main><article><p>Move me</p></article></main></body>");
    const locator = buildLocator(document.querySelector("p")!);
    const moved = documentFrom("<body><aside><p>Move me</p></aside></body>");
    const modifications: Modification[] = [{ id: "m1", type: "context", target: locator, value: { text: "A note" } }];

    const statuses = await applyModifications(moved, modifications);

    expect(statuses).toEqual([{ id: "m1", status: "applied" }]);
  });

  it("leaves a genuinely stale modification unresolved, not needing review", async () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const fakeLocator = { path: "html>body>p:nth-of-type(9)", fingerprint: "x", textHint: "x" };
    const modifications: Modification[] = [{ id: "m1", type: "context", target: fakeLocator, value: { text: "note" } }];

    const statuses = await applyModifications(document, modifications);

    expect(statuses).toEqual([{ id: "m1", status: "unresolved" }]);
  });

  // Acceptance criteria: "forwarding applies against the anchor's current
  // destination" — the anchor's live href, not the href captured back
  // when the modification was first created, so a link whose destination
  // changed underneath it forwards wherever it actually points now.
  it("forwards to the anchor's current href, not the modification's stored href, once it has drifted", async () => {
    const document = documentFrom("<body><a href='/old'>link</a></body>");
    const locator = buildLocator(document.querySelector("a")!);
    document.querySelector("a")!.setAttribute("href", "/new");

    const fetcher = fetcherFor({ "https://example.com/new": () => htmlResponse("<p>New destination</p>") });
    const modifications: Modification[] = [
      { id: "m1", type: "forwardLink", target: locator, value: { href: "https://example.com/old" } },
    ];

    const statuses = await applyModifications(document, modifications, contextFor("https://example.com/", fetcher));

    expect(statuses).toEqual([{ id: "m1", status: "applied" }]);
    const forwarded = document.querySelector("[data-ax-forward]");
    expect(forwarded?.textContent).toContain("New destination");
  });
});

describe("dedupeModifications", () => {
  it("keeps only one entry per (target path, type), even with different ids", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target },
      { id: "m2", type: "hide", target },
    ];

    const deduped = dedupeModifications(modifications);

    expect(deduped).toHaveLength(1);
  });

  it("keeps the last one when the same (target, type) is submitted more than once", () => {
    const document = documentFrom("<body><p>Hello</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "first draft" } },
      { id: "m2", type: "context", target, value: { text: "final version" } },
    ];

    const deduped = dedupeModifications(modifications);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("m2");
  });

  it("keeps modifications with the same target but different types", () => {
    const document = documentFrom("<body><a href='/x'>link</a></body>");
    const target = buildLocator(document.querySelector("a")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "a note" } },
      { id: "m2", type: "forwardLink", target, value: { href: "https://example.com/x" } },
    ];

    expect(dedupeModifications(modifications)).toHaveLength(2);
  });

  it("keeps modifications targeting different elements", () => {
    const document = documentFrom("<body><header>H</header><footer>F</footer></body>");
    const modifications: Modification[] = [
      { id: "m1", type: "hide", target: buildLocator(document.querySelector("header")!) },
      { id: "m2", type: "hide", target: buildLocator(document.querySelector("footer")!) },
    ];

    expect(dedupeModifications(modifications)).toHaveLength(2);
  });
});

describe("applyModifications: context", () => {
  it("inserts the context text as a real text node adjacent to the element", () => {
    const document = documentFrom("<body><img data-ax-id='ax-1' src='/chart.png'></body>");
    const target = buildLocator(document.querySelector("img")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "Shows quarterly revenue by region." } },
    ];

    applyModifications(document, modifications);

    const note = document.querySelector("[data-ax-context]");
    expect(note).not.toBeNull();
    expect(note!.textContent).toBe("Shows quarterly revenue by region.");
    // Adjacent to, not inside — must work for void elements like <img> too.
    expect(document.querySelector("img")!.nextElementSibling).toBe(note);
  });

  it("carries a data-ax-id derived from its target's, so the agent payload's block emitter picks it up", () => {
    // buildAgentPayload only emits a Markdown block for elements carrying
    // data-ax-id — assigned once, before modifications run. A context note
    // is inserted afterward, so without its own derived id it would render
    // correctly in the HTML payload (outerHTML includes it regardless) but
    // silently vanish from the Markdown payload.
    const document = documentFrom("<body><p data-ax-id='ax-7'>Target</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "Explanation" } },
    ];

    applyModifications(document, modifications);

    const note = document.querySelector("[data-ax-context]")!;
    expect(note.getAttribute("data-ax-id")).toBe("ax-7-context");
  });

  it("carries the modification's own id, independent of the target-derived data-ax-id, so the modification navigator (NIM-64) can join a block back to the modification that produced it", () => {
    const document = documentFrom("<body><p data-ax-id='ax-7'>Target</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "mod-42", type: "context", target, value: { text: "Explanation" } },
    ];

    applyModifications(document, modifications);

    const note = document.querySelector("[data-ax-context]")!;
    expect(note.getAttribute("data-ax-mod-id")).toBe("mod-42");
  });

  it("does not carry the note as an attribute, comment, or aria-label", () => {
    const document = documentFrom("<body><p>Some text</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "Explanation" } },
    ];

    applyModifications(document, modifications);

    const html = document.body.innerHTML;
    expect(html).not.toContain('aria-label="Explanation"');
    expect(html).not.toContain("<!--Explanation-->");
    // It must be real text content, not merely an attribute value.
    const note = document.querySelector("[data-ax-context]")!;
    expect(note.textContent?.trim()).toBe("Explanation");
  });

  it("escapes publisher-supplied text that looks like markup", () => {
    const document = documentFrom("<body><p>Target</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const dangerous = "<script>alert(1)</script> & <b>bold</b>";
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: dangerous } },
    ];

    applyModifications(document, modifications);

    expect(document.querySelector("[data-ax-context] script")).toBeNull();
    expect(document.querySelector("[data-ax-context]")!.textContent).toBe(dangerous);
  });

  it("upserts rather than duplicating when the same target is annotated twice", () => {
    const document = documentFrom("<body><p>Target</p></body>");
    const target = buildLocator(document.querySelector("p")!);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "First draft" } },
      { id: "m2", type: "context", target, value: { text: "Final version" } },
    ];

    applyModifications(document, modifications);

    const notes = document.querySelectorAll("[data-ax-context]");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe("Final version");
  });

  it("keeps both notes when two different targets share the same nearest block ancestor", () => {
    // Reproduces a real bug: two links annotated inside the same paragraph
    // both resolve to that paragraph as their nearest block ancestor. The
    // upsert logic used to key off "does markerAttr sit right after the
    // anchor" alone, so the second note's insertion saw the first note
    // already there, mistook it for a stale copy of itself, and deleted
    // it — one context note silently overwriting the other, even though
    // both modifications reported "applied".
    const document = documentFrom(
      "<body><p data-ax-id='ax-1'>See <a data-ax-id='ax-2'>first</a> and <a data-ax-id='ax-3'>second</a>.</p></body>",
    );
    const [firstLink, secondLink] = Array.from(document.querySelectorAll("a"));
    const modifications: Modification[] = [
      { id: "m1", type: "context", target: buildLocator(firstLink), value: { text: "About the first link" } },
      { id: "m2", type: "context", target: buildLocator(secondLink), value: { text: "About the second link" } },
    ];

    applyModifications(document, modifications);

    const notes = Array.from(document.querySelectorAll("[data-ax-context]"));
    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.textContent)).toEqual(
      expect.arrayContaining(["About the first link", "About the second link"]),
    );
  });
});

describe("applyModifications: context targets the nearest block ancestor", () => {
  it("does not merge into the enclosing block when the target is a deeply nested inline element", () => {
    // Reproduces a real bug: clicking a page always selects the innermost
    // element under the cursor. For a styled heading like
    // <h1><span><span>Title</span></span></h1>, that's the inner span, not
    // the h1 — inserting the note as ITS sibling nests it inside the h1,
    // and buildAgentPayload's Turndown pass over the h1 then merges both
    // texts into one block with no separator between them.
    const document = documentFrom(
      "<body><h1 data-ax-id='ax-1'><span lang='en'><span class='inner' data-ax-id='ax-2'>Large language model</span></span></h1></body>",
    );
    const innerSpan = document.querySelector(".inner")!;
    const target = buildLocator(innerSpan);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "This is the main title." } },
    ];

    applyModifications(document, modifications);

    const h1 = document.querySelector("h1")!;
    expect(h1.textContent).toBe("Large language model");
    expect(h1.nextElementSibling?.hasAttribute("data-ax-context")).toBe(true);
    expect(h1.nextElementSibling?.textContent).toBe("This is the main title.");
  });

  it("does not merge into the enclosing paragraph when the target is a call-to-action embedded inline", () => {
    // A <button> is real content, not inline text formatting, so the old
    // rule stopped climbing there — but it can still sit as phrasing
    // content inside a <p>, which is what agent-payload.ts groups into
    // one Markdown block. Anchoring at the button nests the note inside
    // that same paragraph, reproducing the merge this module exists to
    // avoid, for exactly the "unlabelled call to action" case NIM-50
    // names as a headline scenario.
    const document = documentFrom(
      "<body><p data-ax-id='ax-1'>Read more <button data-ax-id='ax-2'>Learn more</button></p></body>",
    );
    const button = document.querySelector("button")!;
    const target = buildLocator(button);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "Opens the pricing page." } },
    ];

    applyModifications(document, modifications);

    const p = document.querySelector("p")!;
    expect(p.textContent).toBe("Read more Learn more");
    expect(p.nextElementSibling?.hasAttribute("data-ax-context")).toBe(true);
    expect(p.nextElementSibling?.textContent).toBe("Opens the pricing page.");
  });

  it("still assigns the note an id when the anchor falls back to document.body", () => {
    // nearestBlockAncestor falls back to document.body when nothing
    // block-level is found above a lone inline element — and body never
    // carries a data-ax-id. Deriving the note's id from the anchor rather
    // than the original target would silently drop it from the Markdown
    // payload in exactly that case.
    const document = documentFrom("<body><span data-ax-id='ax-1'>lone inline text</span></body>");
    const span = document.querySelector("span")!;
    const target = buildLocator(span);
    const modifications: Modification[] = [
      { id: "m1", type: "context", target, value: { text: "A note on this span." } },
    ];

    applyModifications(document, modifications);

    const note = document.querySelector("[data-ax-context]")!;
    expect(note.getAttribute("data-ax-id")).toBe("ax-1-context");
    // The anchor here is document.body, which has no meaningful "next
    // sibling" slot (its parent is <html>) — the note must land inside
    // body, not escape into <html> as a sibling of <body>.
    expect(note.parentElement).toBe(document.body);
  });
});

describe("applyModifications: shadowing (NIM-52)", () => {
  it("retains a modification whose target is inside a hidden subtree, and does not apply it", async () => {
    const document = documentFrom("<body><section><p data-ax-id='ax-1'>Inside</p></section></body>");
    const section = document.querySelector("section")!;
    const p = document.querySelector("p")!;
    const modifications: Modification[] = [
      { id: "m-hide", type: "hide", target: buildLocator(section) },
      { id: "m-context", type: "context", target: buildLocator(p), value: { text: "A note" } },
    ];

    const statuses = await applyModifications(document, modifications);

    // Retained: the section is gone, but nothing about the context
    // modification itself was deleted or mutated — it's the caller's own
    // input list, still intact, exactly as NIM-55's review list will need.
    expect(modifications).toHaveLength(2);
    expect(document.querySelector("section")).toBeNull();
    expect(document.querySelector("[data-ax-context]")).toBeNull();
    expect(statuses).toEqual(
      expect.arrayContaining([
        { id: "m-hide", status: "applied" },
        { id: "m-context", status: "shadowed" },
      ]),
    );
  });

  it("tells a shadowed modification apart from one that plain doesn't resolve", async () => {
    const document = documentFrom("<body><section><p data-ax-id='ax-1'>Inside</p></section></body>");
    const section = document.querySelector("section")!;
    const p = document.querySelector("p")!;
    const brokenLocator = { path: "html>body>p:nth-of-type(9)", fingerprint: "x", textHint: "x" };
    const modifications: Modification[] = [
      { id: "m-hide", type: "hide", target: buildLocator(section) },
      { id: "m-shadowed", type: "context", target: buildLocator(p), value: { text: "shadowed" } },
      { id: "m-broken", type: "context", target: brokenLocator, value: { text: "broken" } },
    ];

    const statuses = await applyModifications(document, modifications);

    expect(statuses.find((s) => s.id === "m-shadowed")?.status).toBe("shadowed");
    expect(statuses.find((s) => s.id === "m-broken")?.status).toBe("unresolved");
  });

  it("shadowing is structural, not a race with submission order — a hide submitted after still shadows", async () => {
    const document = documentFrom("<body><section><p data-ax-id='ax-1'>Inside</p></section></body>");
    const section = document.querySelector("section")!;
    const p = document.querySelector("p")!;
    const modifications: Modification[] = [
      { id: "m-context", type: "context", target: buildLocator(p), value: { text: "A note" } },
      { id: "m-hide", type: "hide", target: buildLocator(section) },
    ];

    const statuses = await applyModifications(document, modifications);

    expect(statuses.find((s) => s.id === "m-context")?.status).toBe("shadowed");
    expect(document.querySelector("[data-ax-context]")).toBeNull();
  });

  it("marks a hide nested inside another hide's subtree as shadowed too, not just applied redundantly", async () => {
    const document = documentFrom(
      "<body><section><article><p>Inside</p></article></section></body>",
    );
    const section = document.querySelector("section")!;
    const article = document.querySelector("article")!;
    const modifications: Modification[] = [
      { id: "m-outer", type: "hide", target: buildLocator(section) },
      { id: "m-inner", type: "hide", target: buildLocator(article) },
    ];

    const statuses = await applyModifications(document, modifications);

    expect(statuses).toEqual(
      expect.arrayContaining([
        { id: "m-outer", status: "applied" },
        { id: "m-inner", status: "shadowed" },
      ]),
    );
    // Still gone either way — the outer hide's removal takes the whole
    // subtree with it regardless of the inner hide's own status.
    expect(document.querySelector("section")).toBeNull();
  });

  it("restores a shadowed modification, unchanged, once its hiding ancestor is removed from the configuration", async () => {
    // Every render re-fetches and re-applies from a clean document
    // (ADR-0001), so "unhiding" is simply: the next render's modification
    // list no longer includes the hide. Nothing about the context
    // modification needed to change for it to apply again.
    const freshDocument = () =>
      documentFrom("<body><section><p data-ax-id='ax-1'>Inside</p></section></body>");
    const p = () => freshDocument().querySelector("p")!;
    const contextMod: Modification = {
      id: "m-context",
      type: "context",
      target: buildLocator(p()),
      value: { text: "Still here" },
    };

    const hiddenRender = freshDocument();
    const hiddenSection = hiddenRender.querySelector("section")!;
    const hiddenStatuses = await applyModifications(hiddenRender, [
      { id: "m-hide", type: "hide", target: buildLocator(hiddenSection) },
      contextMod,
    ]);
    expect(hiddenStatuses.find((s) => s.id === "m-context")?.status).toBe("shadowed");

    const restoredRender = freshDocument();
    const restoredStatuses = await applyModifications(restoredRender, [contextMod]);

    expect(restoredStatuses).toEqual([{ id: "m-context", status: "applied" }]);
    const note = restoredRender.querySelector("[data-ax-context]");
    expect(note).not.toBeNull();
    expect(note!.textContent).toBe("Still here");
  });

  it("a context note and a forwarded link coexist on the same anchor without clobbering each other", async () => {
    const document = documentFrom(
      "<body><p data-ax-id='ax-1'>See <a data-ax-id='ax-2' href='https://example.com/more'>more</a>.</p></body>",
    );
    const anchor = document.querySelector("a")!;
    const modifications: Modification[] = [
      { id: "m-context", type: "context", target: buildLocator(anchor), value: { text: "A note" } },
      {
        id: "m-forward",
        type: "forwardLink",
        target: buildLocator(anchor),
        value: { href: "https://example.com/more" },
      },
    ];
    const fetchImpl = (async () =>
      new Response("<body><p>Fetched.</p></body>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => ["93.184.216.34"] }), { fetchImpl });

    const statuses = await applyModifications(document, modifications, {
      pageUrl: "https://example.com/",
      fetcher,
      budget: new FetchBudget(),
      cache: new ForwardLinkCache(),
      charBudget: new ForwardCharBudget(),
    });

    expect(statuses).toEqual(
      expect.arrayContaining([
        { id: "m-context", status: "applied" },
        { id: "m-forward", status: "applied" },
      ]),
    );
    expect(document.querySelector("[data-ax-context]")).not.toBeNull();
    expect(document.querySelector("[data-ax-forward]")).not.toBeNull();
    const p = document.querySelector("p")!;
    expect(p.textContent).toBe("See more.");
  });
});
