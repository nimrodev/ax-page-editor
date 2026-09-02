import * as fs from "node:fs";
import * as path from "node:path";

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
}
