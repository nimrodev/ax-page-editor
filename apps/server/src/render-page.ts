import { JSDOM } from "jsdom";
import { PageFetcher } from "./fetcher";
import { FetchBudget } from "./fetch-budget";
import { sanitizeDocument } from "./sanitizer";
import { assignAxIds } from "./ax-id";
import { buildAgentPayload, AgentPayload } from "./agent-payload";
import { injectBaseHref } from "./base-href";
import { applyModifications } from "./apply-modifications";
import { ForwardLinkCache, ForwardCharBudget } from "./link-forward";
import type { Modification } from "@ax/schema";

export interface FixtureLookup {
  get(url: string): string | undefined;
}

export interface RenderOptions {
  fixtures?: FixtureLookup;
  useFixtures?: boolean;
  modifications?: Modification[];
  // Shared across renders by the caller so a page with many forwarded
  // links doesn't refetch them on every preview (NIM-51). A fresh one is
  // used when omitted, which is correct — just uncached — for callers
  // (mostly tests) that don't care about that reuse.
  forwardCache?: ForwardLinkCache;
  // Total characters forwarded content may consume across this one
  // render; independent per call, unlike forwardCache.
  forwardCharBudget?: number;
}

interface PreparedPage {
  document: Document;
  finalUrl: string;
}

/**
 * The shared first half of the pipeline: fetch (or read a fixture),
 * sanitize for security, and assign element handles. Both the agent
 * payload and the human-view preview build on exactly this same
 * deterministic assignment, so ax-ids are consistent BETWEEN THE TWO on a
 * static fixture or an unchanged live page.
 *
 * Known limitation: renderPage and prepareHumanView each call this
 * independently, meaning two separate HTTP fetches of the target URL. A
 * page whose markup order shifts between those two fetches (rotating ads,
 * A/B-tested layout, any live re-render) would get different ax-ids
 * between the agent and human views for what is visually the same
 * element. Cross-referencing selection between the two views (Compare
 * mode, NIM-58) will need either a single shared fetch per load or a
 * content-based match rather than this positional one — deferred rather
 * than solved speculatively ahead of that ticket.
 */
async function preparePage(
  url: string,
  fetcher: PageFetcher,
  budget: FetchBudget,
  options: RenderOptions,
): Promise<PreparedPage> {
  const fromFixture = options.useFixtures ? options.fixtures?.get(url) : undefined;
  const { html, finalUrl } =
    fromFixture !== undefined ? { html: fromFixture, finalUrl: url } : await fetcher.fetch(url, budget);

  const dom = new JSDOM(html);
  sanitizeDocument(dom.window.document);
  assignAxIds(dom.window.document);

  return { document: dom.window.document, finalUrl };
}

/**
 * The transform at the heart of the product: a target URL becomes an agent
 * payload. Nothing here depends on NestJS, so it tests without a testing
 * module (ADR-0006).
 */
export async function renderPage(
  url: string,
  fetcher: PageFetcher,
  budget: FetchBudget,
  options: RenderOptions = {},
): Promise<AgentPayload> {
  const { document, finalUrl } = await preparePage(url, fetcher, budget, options);
  await applyModifications(document, options.modifications ?? [], {
    pageUrl: finalUrl,
    fetcher,
    budget,
    cache: options.forwardCache ?? new ForwardLinkCache(),
    charBudget: new ForwardCharBudget(options.forwardCharBudget),
  });
  return buildAgentPayload(document);
}

/**
 * Prepares the same fetched, sanitized, id-annotated page for the
 * human-view preview instead: styling and structure kept intact, with a
 * <base> injected so the page's own relative URLs resolve when rendered
 * outside its original origin.
 */
export async function prepareHumanView(
  url: string,
  fetcher: PageFetcher,
  budget: FetchBudget,
  options: RenderOptions = {},
): Promise<{ html: string }> {
  const { document, finalUrl } = await preparePage(url, fetcher, budget, options);
  injectBaseHref(document, finalUrl);
  return { html: document.documentElement.outerHTML };
}
