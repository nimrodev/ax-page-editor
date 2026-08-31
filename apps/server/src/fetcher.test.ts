import { describe, expect, it, jest } from "@jest/globals";
import { PageFetcher, FetchFailure } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

function allowAllGuard() {
  return new SsrfGuard({ resolveHost: async () => ["93.184.216.34"] });
}

describe("PageFetcher", () => {
  it("fetches and returns the HTML body with an honest default user agent", async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^AXEditor\//);
      return htmlResponse("<html><body>hi</body></html>");
    });

    const fetcher = new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await fetcher.fetch("https://example.com/", new FetchBudget());

    expect(result.html).toContain("hi");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses AX_USER_AGENT as an override when set", async () => {
    process.env.AX_USER_AGENT = "CustomBot/1.0";
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("CustomBot/1.0");
      return htmlResponse("<html></html>");
    });
    const fetcher = new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetcher.fetch("https://example.com/", new FetchBudget());
    delete process.env.AX_USER_AGENT;
  });

  it("re-checks the SSRF guard on every redirect hop", async () => {
    const guard = new SsrfGuard({
      resolveHost: async (host) => (host === "internal.example.com" ? ["10.0.0.5"] : ["93.184.216.34"]),
    });
    const fetchImpl = jest.fn(async (url: string) => {
      if (url === "https://public.example.com/") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://internal.example.com/" },
        });
      }
      throw new Error("should not reach this host");
    });

    const fetcher = new PageFetcher(guard, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(fetcher.fetch("https://public.example.com/", new FetchBudget())).rejects.toThrow(
      FetchFailure,
    );
  });

  it("caps the redirect chain", async () => {
    let hop = 0;
    const fetchImpl = jest.fn(async () => {
      hop += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/hop-${hop}` },
      });
    });
    const fetcher = new PageFetcher(allowAllGuard(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRedirects: 3,
    });
    await expect(fetcher.fetch("https://example.com/", new FetchBudget())).rejects.toThrow(
      FetchFailure,
    );
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("rejects a response whose content type is not HTML", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const fetcher = new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(fetcher.fetch("https://example.com/file.pdf", new FetchBudget())).rejects.toThrow(
      FetchFailure,
    );
  });

  it("aborts a response body larger than the byte cap", async () => {
    const big = "x".repeat(200);
    const fetchImpl = jest.fn(async () => htmlResponse(big));
    const fetcher = new PageFetcher(allowAllGuard(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxBytes: 50,
    });
    await expect(fetcher.fetch("https://example.com/", new FetchBudget())).rejects.toThrow(
      FetchFailure,
    );
  });

  it("times out a fetch that never resolves", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const fetcher = new PageFetcher(allowAllGuard(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10,
    });
    await expect(fetcher.fetch("https://example.com/", new FetchBudget())).rejects.toThrow(
      FetchFailure,
    );
  });

  it("blocks a target whose host resolves to a private address", async () => {
    const guard = new SsrfGuard({ resolveHost: async () => ["10.0.0.5"] });
    const fetcher = new PageFetcher(guard, {});
    await expect(
      fetcher.fetch("https://internal.example.com/", new FetchBudget()),
    ).rejects.toMatchObject({ reason: "blocked-for-security" });
  });

  it("reports a non-2xx response as blocked by the site, without reading its body as content", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response("<html>forbidden</html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      }),
    );
    const fetcher = new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      fetcher.fetch("https://example.com/", new FetchBudget()),
    ).rejects.toMatchObject({ reason: "blocked-by-site" });
  });

  it("enforces the fetch budget", async () => {
    const fetchImpl = jest.fn(async () => htmlResponse("<html></html>"));
    const fetcher = new PageFetcher(allowAllGuard(), { fetchImpl: fetchImpl as unknown as typeof fetch });
    const budget = new FetchBudget(1);
    await fetcher.fetch("https://example.com/a", budget);
    await expect(fetcher.fetch("https://example.com/b", budget)).rejects.toThrow(FetchFailure);
  });
});
