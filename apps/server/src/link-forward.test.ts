import { describe, expect, it, jest } from "@jest/globals";
import { JSDOM } from "jsdom";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { applyForwardLink, ForwardLinkCache, ForwardCharBudget, ForwardContext } from "./link-forward";

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
  return { fetcher: new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}

function contextFor(pageUrl: string, fetcher: PageFetcher, overrides: Partial<ForwardContext> = {}): ForwardContext {
  return {
    pageUrl,
    fetcher,
    budget: new FetchBudget(),
    cache: new ForwardLinkCache(),
    charBudget: new ForwardCharBudget(),
    ...overrides,
  };
}

describe("applyForwardLink", () => {
  it("appends the destination's content as its own block after the anchor's containing block, leaving the anchor in place", async () => {
    const { fetcher } = fetcherFor({
      "https://example.com/more": () =>
        htmlResponse("<body><h1>More</h1><p>Extra detail about the topic.</p></body>"),
    });
    const document = documentFrom("<body><p data-ax-id='ax-1'>See <a data-ax-id='ax-2'>more</a>.</p></body>");
    const anchor = document.querySelector("a")!;

    await applyForwardLink(document, anchor, { href: "https://example.com/more" }, contextFor("https://example.com/", fetcher), "mod-1");

    const p = document.querySelector("p")!;
    expect(p.textContent).toBe("See more.");
    const forward = p.nextElementSibling!;
    expect(forward.getAttribute("data-ax-forward")).toBe("");
    expect(forward.textContent).toContain("https://example.com/more");
    expect(forward.textContent).toContain("Extra detail about the topic.");
    // Markdown has no closing tag — without an explicit end marker there's
    // no way to tell forwarded content apart from the next real block once
    // it's serialized to plain text, especially when it wasn't truncated.
    expect(forward.textContent).toContain("End of forwarded content");
  });

  it("skips a link that resolves to the current page, without fetching, and marks it visibly", async () => {
    const { fetcher, fetchImpl } = fetcherFor({});
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>self</a></p></body>");
    const anchor = document.querySelector("a")!;

    await applyForwardLink(
      document,
      anchor,
      { href: "https://example.com/page#section" },
      contextFor("https://example.com/page", fetcher),
      "mod-1",
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.getAttribute("data-ax-forward-kind")).toBe("self");
  });

  it("treats a self-link differing only by a trailing slash as the same page, without fetching", async () => {
    const { fetcher, fetchImpl } = fetcherFor({});
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>self</a></p></body>");
    const anchor = document.querySelector("a")!;

    await applyForwardLink(
      document,
      anchor,
      { href: "https://example.com/page" },
      contextFor("https://example.com/page/", fetcher),
      "mod-1",
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.getAttribute("data-ax-forward-kind")).toBe("self");
  });

  it("renders a visible error node rather than a silent omission when the fetch fails", async () => {
    const { fetcher } = fetcherFor({
      "https://example.com/broken": () => new Response("nope", { status: 500 }),
    });
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>broken</a></p></body>");
    const anchor = document.querySelector("a")!;

    await applyForwardLink(
      document,
      anchor,
      { href: "https://example.com/broken" },
      contextFor("https://example.com/", fetcher),
      "mod-1",
    );

    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.getAttribute("data-ax-forward-kind")).toBe("error");
    expect(forward.textContent).toContain("https://example.com/broken");
  });

  it("renders a typed placeholder for a non-HTML destination instead of garbage", async () => {
    const { fetcher } = fetcherFor({
      "https://example.com/file.pdf": () =>
        new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
    });
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>pdf</a></p></body>");
    const anchor = document.querySelector("a")!;

    await applyForwardLink(
      document,
      anchor,
      { href: "https://example.com/file.pdf" },
      contextFor("https://example.com/", fetcher),
      "mod-1",
    );

    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.getAttribute("data-ax-forward-kind")).toBe("unsupported");
  });

  it("fetches a repeated destination only once across multiple anchors, via the shared cache", async () => {
    const { fetcher, fetchImpl } = fetcherFor({
      "https://example.com/shared": () => htmlResponse("<body><p>Shared content.</p></body>"),
    });
    const document = documentFrom(
      "<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>one</a></p><p data-ax-id='ax-3'><a data-ax-id='ax-4'>two</a></p></body>",
    );
    const [anchorOne, anchorTwo] = Array.from(document.querySelectorAll("a"));
    const cache = new ForwardLinkCache();
    const ctx = contextFor("https://example.com/", fetcher, { cache });

    await applyForwardLink(document, anchorOne, { href: "https://example.com/shared" }, ctx, "mod-1");
    await applyForwardLink(document, anchorTwo, { href: "https://example.com/shared" }, ctx, "mod-1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const forwards = document.querySelectorAll("[data-ax-forward-kind='content']");
    expect(forwards).toHaveLength(2);
  });

  it("truncates content once the shared per-render character budget is spent, marking the truncation", async () => {
    const { fetcher } = fetcherFor({
      "https://example.com/long": () => htmlResponse(`<body><p>${"z".repeat(100)}</p></body>`),
    });
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>long</a></p></body>");
    const anchor = document.querySelector("a")!;
    const ctx = contextFor("https://example.com/", fetcher, { charBudget: new ForwardCharBudget(10) });

    await applyForwardLink(document, anchor, { href: "https://example.com/long" }, ctx, "mod-1");

    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.textContent).toContain("(truncated)");
    expect(forward.textContent!.match(/z/g)!.length).toBeLessThanOrEqual(10);
  });

  it("cuts a truncation at a word boundary rather than mid-word", async () => {
    const { fetcher } = fetcherFor({
      "https://example.com/words": () =>
        htmlResponse("<body><p>alpha bravo charlie delta echo foxtrot golf</p></body>"),
    });
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>words</a></p></body>");
    const anchor = document.querySelector("a")!;
    // Chosen to land mid-word inside "charlie" if truncation were a raw
    // slice: "alpha bravo char" is 17 chars.
    const ctx = contextFor("https://example.com/", fetcher, { charBudget: new ForwardCharBudget(17) });

    await applyForwardLink(document, anchor, { href: "https://example.com/words" }, ctx, "mod-1");

    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.textContent).toContain("(truncated)");
    expect(forward.textContent).toContain("alpha bravo");
    expect(forward.textContent).not.toContain("char ");
    expect(forward.textContent).not.toMatch(/charlie/);
  });

  it("does not resolve targets inside the fetched fragment — forwarding stays one level deep", async () => {
    const { fetchImpl: destinationFetch } = fetcherFor({});
    const { fetcher } = fetcherFor({
      "https://example.com/one-level": () =>
        htmlResponse('<body><p>See <a href="https://example.com/two-levels">more</a>.</p></body>'),
    });
    const document = documentFrom("<body><p data-ax-id='ax-1'><a data-ax-id='ax-2'>hop</a></p></body>");
    const anchor = document.querySelector("a")!;

    await applyForwardLink(
      document,
      anchor,
      { href: "https://example.com/one-level" },
      contextFor("https://example.com/", fetcher),
      "mod-1",
    );

    // The forwarded fragment's own link is never itself resolved or
    // fetched — applyForwardLink only ever runs on modifications attached
    // to the target page's own document.
    expect(destinationFetch).not.toHaveBeenCalled();
    const forward = document.querySelector("[data-ax-forward]")!;
    expect(forward.textContent).toContain("more");
  });
});

describe("ForwardLinkCache", () => {
  it("resolves subsequent lookups to the same in-flight promise rather than calling fetchFn again", async () => {
    const fetchFn = jest.fn(async () => ({ kind: "self" as const }));
    const cache = new ForwardLinkCache();

    const [a, b] = await Promise.all([
      cache.getOrFetch("https://example.com/x", fetchFn),
      cache.getOrFetch("https://example.com/x", fetchFn),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});
