import { describe, expect, it } from "@jest/globals";
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
