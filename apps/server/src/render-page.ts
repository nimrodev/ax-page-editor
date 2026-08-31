import { JSDOM } from "jsdom";
import { PageFetcher } from "./fetcher";
import { FetchBudget } from "./fetch-budget";
import { sanitizeDocument } from "./sanitizer";
import { assignAxIds } from "./ax-id";
import { buildAgentPayload, AgentPayload } from "./agent-payload";

/**
 * The transform at the heart of the product: a target URL becomes an agent
 * payload. Fetch, sanitize, assign element handles, emit. Nothing here
 * depends on NestJS, so it tests without a testing module (ADR-0006).
 */
export interface FixtureLookup {
  get(url: string): string | undefined;
}

export interface RenderOptions {
  fixtures?: FixtureLookup;
  useFixtures?: boolean;
}

export async function renderPage(
  url: string,
  fetcher: PageFetcher,
  budget: FetchBudget,
  options: RenderOptions = {},
): Promise<AgentPayload> {
  const fromFixture = options.useFixtures ? options.fixtures?.get(url) : undefined;
  const html = fromFixture ?? (await fetcher.fetch(url, budget)).html;

  const dom = new JSDOM(html);
  sanitizeDocument(dom.window.document);
  assignAxIds(dom.window.document);

  return buildAgentPayload(dom.window.document);
}
