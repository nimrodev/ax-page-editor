import { RenderFailureReason } from "@ax/schema";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget, FetchBudgetExceededError } from "./fetch-budget";

export class FetchFailure extends Error {
  constructor(
    public readonly reason: RenderFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "FetchFailure";
  }
}

export interface FetchResult {
  html: string;
  finalUrl: string;
}

export interface PageFetcherOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const DEFAULT_USER_AGENT = "AXEditor/1.0 (+https://github.com/nimrodev/ax-page-editor)";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes("text/html");
}

export class PageFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(
    private readonly guard: SsrfGuard,
    options: PageFetcherOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? process.env.AX_USER_AGENT ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  }

  async fetch(url: string, budget: FetchBudget): Promise<FetchResult> {
    let currentUrl = url;

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      await this.assertSafe(currentUrl);
      try {
        budget.use();
      } catch (err) {
        if (err instanceof FetchBudgetExceededError) {
          throw new FetchFailure("budget-exceeded", err.message);
        }
        throw err;
      }

      const response = await this.fetchOnce(currentUrl);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new FetchFailure("network", `Redirect from "${currentUrl}" had no Location header.`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new FetchFailure(
          "blocked-by-site",
          `"${currentUrl}" responded with status ${response.status}.`,
        );
      }

      if (!isHtmlContentType(response.headers.get("content-type"))) {
        throw new FetchFailure(
          "unsupported-content-type",
          `"${currentUrl}" returned a non-HTML content type.`,
        );
      }

      const html = await this.readBodyWithCap(response);
      return { html, finalUrl: currentUrl };
    }

    throw new FetchFailure("too-many-redirects", `Exceeded ${this.maxRedirects} redirects from "${url}".`);
  }

  /**
   * Known gap: this checks the hostname's resolved address, then fetches
   * the same hostname moments later — the connection itself re-resolves
   * DNS rather than reusing the checked address. A near-zero-TTL DNS
   * rebind between the two could in principle slip a blocked address past
   * the check. Closing this fully means pinning the socket to the
   * validated IP while still presenting the original hostname for TLS SNI
   * and the Host header, which is a real change to how fetches are
   * dispatched — deferred rather than risking a rushed version that breaks
   * TLS to legitimate sites. Every redirect hop is still independently
   * re-checked, which is the far more common real-world SSRF vector this
   * guard fully closes.
   */
  private async assertSafe(url: string): Promise<void> {
    try {
      await this.guard.assertSafeUrl(url);
    } catch (err) {
      throw new FetchFailure(
        "blocked-for-security",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async fetchOnce(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": this.userAgent },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new FetchFailure("timeout", `Fetching "${url}" timed out after ${this.timeoutMs}ms.`);
      }
      throw new FetchFailure("network", `Fetching "${url}" failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBodyWithCap(response: Response): Promise<string> {
    if (!response.body) {
      return response.text();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > this.maxBytes) {
        await reader.cancel();
        throw new FetchFailure("too-large", `Response exceeded the ${this.maxBytes}-byte cap.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  }
}
