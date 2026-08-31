import { describe, expect, it } from "@jest/globals";
import { renderPage } from "./render-page";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { FixtureStore } from "./fixture-store";

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
