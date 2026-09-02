import * as fs from "node:fs";
import * as path from "node:path";
import { JSDOM } from "jsdom";

/**
 * Committed HTML snapshots of the verified demo pages, so evaluation
 * survives being offline or a live page changing shape. Keyed by exact
 * URL — full normalization is a later slice's concern (see CONTEXT.md).
 */
const FIXTURES: Record<string, string> = {
  "https://en.wikipedia.org/wiki/Large_language_model": "wikipedia-llm.html",
  "https://www.bbc.com/news": "bbc-news.html",
  "https://stripe.com/pricing": "stripe-pricing.html",
};

export class FixtureStore {
  private readonly cache = new Map<string, string>();

  constructor(private readonly fixturesDir: string = path.join(__dirname, "fixtures")) {}

  get(url: string): string | undefined {
    const filename = FIXTURES[url];
    if (!filename) return undefined;

    const cached = this.cache.get(url);
    if (cached) return cached;

    const html = fs.readFileSync(path.join(this.fixturesDir, filename), "utf-8");
    this.cache.set(url, html);
    return html;
  }

  /**
   * NIM-54's dev-only demo tool: mutates a fixture's current HTML in
   * memory and keeps the result as this store's cached copy for `url`,
   * so the next `get()` — and so the next render — sees the changed
   * page. Never touches the committed file on disk; a process restart
   * (or `reset`) reverts to it. Throws for a URL with no committed
   * fixture at all, rather than silently caching an ad-hoc page this
   * store was never meant to serve.
   */
  mutate(url: string, transform: (document: Document) => void): string {
    const html = this.get(url);
    if (html === undefined) {
      throw new Error(`No fixture for ${url} — nothing to mutate`);
    }
    const dom = new JSDOM(html);
    transform(dom.window.document);
    const mutated = dom.window.document.documentElement.outerHTML;
    this.cache.set(url, mutated);
    return mutated;
  }

  /** Discards any mutation for `url`, so the next `get()` re-reads the committed fixture. */
  reset(url: string): void {
    this.cache.delete(url);
  }
}
