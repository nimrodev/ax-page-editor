import { describe, expect, it, jest } from "@jest/globals";
import { JSDOM } from "jsdom";
import { renderPage, prepareHumanView } from "./render-page";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { FixtureStore } from "./fixture-store";
import { buildLocator } from "@ax/schema";

function fetcherReturning(html: string): PageFetcher {
  const guard = new SsrfGuard({ resolveHost: async () => ["93.184.216.34"] });
  return new PageFetcher(guard, {
    fetchImpl: (async () =>
      new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch,
  });
}

describe("renderPage", () => {
  it("fetches, sanitizes, assigns handles, and emits an agent payload", async () => {
    const fetcher = fetcherReturning(
      '<body><script>alert(1)</script><h1>Title</h1><p onclick="x()">Body text</p></body>',
    );

    const payload = await renderPage("https://example.com/", fetcher, new FetchBudget());

    expect(payload.html).not.toContain("<script");
    expect(payload.html).not.toContain("onclick");
    expect(payload.markdownBlocks.some((b) => b.markdown.includes("Title"))).toBe(true);
    expect(payload.markdownBlocks.some((b) => b.markdown.includes("Body text"))).toBe(true);
    for (const block of payload.markdownBlocks) {
      expect(block.axId).toMatch(/^ax-\d+$/);
    }
  });

  it("propagates a fetch failure without swallowing its reason", async () => {
    const guard = new SsrfGuard({ resolveHost: async () => ["10.0.0.5"] });
    const fetcher = new PageFetcher(guard, {});

    await expect(renderPage("https://internal.example.com/", fetcher, new FetchBudget())).rejects.toMatchObject(
      { reason: "blocked-for-security" },
    );
  });
});

describe("renderPage with fixtures", () => {
  it("serves from the fixture store when fixture mode is on, without touching the network", async () => {
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => [] }), {
      fetchImpl: (async () => {
        throw new Error("network should not be reached in fixture mode");
      }) as unknown as typeof fetch,
    });
    const fixtures = {
      get: (url: string) =>
        url === "https://en.wikipedia.org/wiki/Large_language_model"
          ? "<body><h1>Large language model</h1><p>Fixture content.</p></body>"
          : undefined,
    };

    const payload = await renderPage(
      "https://en.wikipedia.org/wiki/Large_language_model",
      fetcher,
      new FetchBudget(),
      { fixtures, useFixtures: true },
    );

    expect(payload.markdownBlocks.some((b) => b.markdown.includes("Fixture content"))).toBe(true);
  });

  it("falls through to a live fetch when fixture mode is on but no fixture matches", async () => {
    const fetcher = fetcherReturning("<body><p>Live content</p></body>");
    const fixtures = { get: () => undefined };

    const payload = await renderPage("https://example.com/", fetcher, new FetchBudget(), {
      fixtures,
      useFixtures: true,
    });

    expect(payload.markdownBlocks.some((b) => b.markdown.includes("Live content"))).toBe(true);
  });
});

describe("renderPage against the real committed fixtures", () => {
  it("renders every committed demo fixture through the real pipeline without error", async () => {
    const store = new FixtureStore();
    const urls = [
      "https://en.wikipedia.org/wiki/Large_language_model",
      "https://www.bbc.com/news",
      "https://stripe.com/pricing",
    ];
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => [] }), {
      fetchImpl: (async () => {
        throw new Error("fixture mode must not touch the network");
      }) as unknown as typeof fetch,
    });

    for (const url of urls) {
      const payload = await renderPage(url, fetcher, new FetchBudget(), {
        fixtures: store,
        useFixtures: true,
      });
      expect(payload.markdownBlocks.length).toBeGreaterThan(0);
      expect(payload.html).not.toContain("<script");
    }
  });
});

describe("prepareHumanView", () => {
  it("keeps styling intact and injects a <base> pointing at the fetched URL", async () => {
    const fetcher = fetcherReturning(
      '<head><style>.x{color:red}</style></head><body><h1>Title</h1><a href="/about">About</a></body>',
    );

    const { html } = await prepareHumanView("https://example.com/page", fetcher, new FetchBudget());

    expect(html).toContain("<style");
    expect(html).toContain('href="https://example.com/page"');
  });

  it("assigns ax-ids using the same scheme a payload render would", async () => {
    const fetcher = fetcherReturning("<body><h1>Title</h1></body>");
    const { html } = await prepareHumanView("https://example.com/", fetcher, new FetchBudget());

    expect(html).toMatch(/data-ax-id="ax-\d+"/);
  });

  it("still runs security sanitization — no scripts or event handlers survive", async () => {
    const fetcher = fetcherReturning('<body><script>alert(1)</script><p onclick="x()">hi</p></body>');
    const { html } = await prepareHumanView("https://example.com/", fetcher, new FetchBudget());

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });
});

describe("renderPage applies modifications through the seam, against real fixtures", () => {
  it("removes navigation from the real Wikipedia fixture's agent payload once hidden", async () => {
    const store = new FixtureStore();
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => [] }), {
      fetchImpl: (async () => {
        throw new Error("fixture mode must not touch the network");
      }) as unknown as typeof fetch,
    });
    const url = "https://en.wikipedia.org/wiki/Large_language_model";

    // First render, unmodified: find an element whose text we can target.
    const baseline = await renderPage(url, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
    });
    const target = baseline.markdownBlocks.find((b) => b.markdown.includes("Main page"));
    expect(target).toBeDefined();

    // Build a real locator against the same fixture, as the client would.
    const dom = new JSDOM(store.get(url)!);
    const el = Array.from(dom.window.document.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Main page",
    )!;
    const locator = buildLocator(el);

    const modified = await renderPage(url, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
      modifications: [{ id: "m1", type: "hide", target: locator }],
    });

    const combined = modified.markdownBlocks.map((b) => b.markdown).join("\n");
    expect(combined).not.toContain("Main page");
    expect(modified.html).not.toContain(">Main page<");
  });

  it("applying the same hide via two different modification ids updates rather than duplicating", async () => {
    const store = new FixtureStore();
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => [] }), {
      fetchImpl: (async () => {
        throw new Error("fixture mode must not touch the network");
      }) as unknown as typeof fetch,
    });
    const url = "https://www.bbc.com/news";

    const dom = new JSDOM(store.get(url)!);
    const el = dom.window.document.querySelector("nav") ?? dom.window.document.body.firstElementChild!;
    const locator = buildLocator(el);

    const once = await renderPage(url, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
      modifications: [{ id: "m1", type: "hide", target: locator }],
    });
    const twice = await renderPage(url, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
      // Two distinct ids targeting the same locator — this is the actual
      // case "applying twice" describes (a second hide action on an
      // element that is already hidden), not two copies of one id.
      modifications: [
        { id: "m1", type: "hide", target: locator },
        { id: "m2", type: "hide", target: locator },
      ],
    });

    expect(twice.markdownBlocks).toEqual(once.markdownBlocks);
  });
});

describe("renderPage applies a context note through the seam, against a real fixture", () => {
  it("adds publisher text adjacent to a real element, present in both payload formats", async () => {
    const store = new FixtureStore();
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => [] }), {
      fetchImpl: (async () => {
        throw new Error("fixture mode must not touch the network");
      }) as unknown as typeof fetch,
    });
    const url = "https://en.wikipedia.org/wiki/Large_language_model";

    const dom = new JSDOM(store.get(url)!);
    const h1 = dom.window.document.querySelector("h1")!;
    const locator = buildLocator(h1);

    const result = await renderPage(url, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
      modifications: [
        {
          id: "m1",
          type: "context",
          target: locator,
          value: { text: "This is the article's main title." },
        },
      ],
    });

    // Assert the note landed as its own block, not merely that the text
    // appears somewhere in the combined output — a weaker check here
    // previously passed even when the note was silently merged into the
    // h1's own block with no separator between them (a real bug: see
    // apply-modifications.test.ts's "targets the nearest block ancestor").
    const titleBlock = result.markdownBlocks.find((b) => b.markdown.trim() === "Large language model");
    const noteBlock = result.markdownBlocks.find((b) =>
      b.markdown.includes("This is the article's main title"),
    );
    expect(titleBlock).toBeDefined();
    expect(noteBlock).toBeDefined();
    expect(noteBlock!.markdown.trim()).toBe("This is the article's main title.");
    expect(result.html).toContain("This is the article's main title.");
    expect(result.html).toContain("data-ax-context");
  });
});

describe("renderPage forwards a link through the seam, against a real fixture", () => {
  it("fetches the destination through the same guard and inserts its content as a new block", async () => {
    const store = new FixtureStore();
    const pageUrl = "https://en.wikipedia.org/wiki/Large_language_model";
    const destinationUrl = "https://example.com/forwarded";

    const fetchImpl = jest.fn(async (url: string) => {
      if (url === pageUrl) {
        return new Response(store.get(pageUrl)!, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === destinationUrl) {
        return new Response("<body><p>Forwarded destination content.</p></body>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => ["93.184.216.34"] }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const dom = new JSDOM(store.get(pageUrl)!);
    const anchor = Array.from(dom.window.document.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Main page",
    )!;
    const locator = buildLocator(anchor);

    const result = await renderPage(pageUrl, fetcher, new FetchBudget(), {
      modifications: [
        { id: "m1", type: "forwardLink", target: locator, value: { href: destinationUrl } },
      ],
    });

    const forwardBlock = result.markdownBlocks.find((b) => b.markdown.includes("Forwarded destination content"));
    expect(forwardBlock).toBeDefined();
    expect(forwardBlock!.markdown).toContain(destinationUrl);
    expect(result.html).toContain("data-ax-forward");
    // The anchor is fetched through the same SsrfGuard as the target
    // page — confirmed by both fetches succeeding under the same guard
    // instance, with no separate unguarded path taken.
    expect(fetchImpl).toHaveBeenCalledWith(destinationUrl, expect.anything());
  });
});

describe("renderPage shadows and restores modifications through the seam, against a real fixture (NIM-52)", () => {
  it("retains a context note inside a hidden ancestor as shadowed, then restores it once the hide is dropped", async () => {
    const store = new FixtureStore();
    const pageUrl = "https://en.wikipedia.org/wiki/Large_language_model";
    const fetcher = new PageFetcher(new SsrfGuard({ resolveHost: async () => [] }), {
      fetchImpl: (async () => {
        throw new Error("fixture mode must not touch the network");
      }) as unknown as typeof fetch,
    });

    const dom = new JSDOM(store.get(pageUrl)!);
    const h1 = dom.window.document.querySelector("h1")!;
    const header = h1.parentElement!;
    const h1Locator = buildLocator(h1);
    const headerLocator = buildLocator(header);

    const shadowed = await renderPage(pageUrl, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
      modifications: [
        { id: "m-hide", type: "hide", target: headerLocator },
        { id: "m-context", type: "context", target: h1Locator, value: { text: "Article title" } },
      ],
    });

    expect(shadowed.modificationStatuses).toEqual(
      expect.arrayContaining([
        { id: "m-hide", status: "applied", tier: "exact" },
        { id: "m-context", status: "shadowed", tier: "exact" },
      ]),
    );
    expect(shadowed.markdownBlocks.some((b) => b.markdown.includes("Article title"))).toBe(false);
    expect(shadowed.markdownBlocks.some((b) => b.markdown.trim() === "Large language model")).toBe(false);

    const restored = await renderPage(pageUrl, fetcher, new FetchBudget(), {
      fixtures: store,
      useFixtures: true,
      // The hide is simply gone from this render's list — nothing about
      // the context modification itself changed (ADR-0001: every render
      // re-applies from scratch, so "unhiding" needs no special code path).
      modifications: [{ id: "m-context", type: "context", target: h1Locator, value: { text: "Article title" } }],
    });

    expect(restored.modificationStatuses).toEqual([{ id: "m-context", status: "applied", tier: "exact" }]);
    expect(restored.markdownBlocks.some((b) => b.markdown.includes("Article title"))).toBe(true);
    expect(restored.markdownBlocks.some((b) => b.markdown.trim() === "Large language model")).toBe(true);
  });
});
