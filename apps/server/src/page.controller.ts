import { Body, Controller, Get, HttpException, HttpStatus, Post } from "@nestjs/common";
import { z } from "zod";
import { ModificationSchema } from "@ax/schema";
import { ZodValidationPipe } from "./zod-validation.pipe";
import { renderPage, prepareHumanView } from "./render-page";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { FetchFailure } from "./fetcher";
import { FixtureStore } from "./fixture-store";
import { ForwardLinkCache } from "./link-forward";
import { applyDevMutations } from "./dev-mutation";

const UrlRequestSchema = z.object({ url: z.string().url() });

const RenderRequestSchema = UrlRequestSchema.extend({
  // Accepted now so the seam does not need to change shape once hide,
  // context, and link forwarding land — unapplied until then.
  modifications: z.array(ModificationSchema).optional(),
});

// Mirrors DevMutation in dev-mutation.ts — kept as a request-boundary
// schema here rather than in @ax/schema since this is dev-only tooling,
// not part of the product's own data model the client and server share.
const DevMutationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    selector: z.string(),
    toParentSelector: z.string(),
    toIndex: z.number().optional(),
  }),
  z.object({ type: z.literal("edit"), selector: z.string(), text: z.string() }),
  z.object({
    type: z.literal("insert"),
    parentSelector: z.string(),
    html: z.string(),
    atIndex: z.number().optional(),
  }),
  z.object({ type: z.literal("delete"), selector: z.string() }),
]);

const DevMutateRequestSchema = UrlRequestSchema.extend({ mutations: z.array(DevMutationSchema) });

const useFixtures = process.env.AX_USE_FIXTURES === "1" || process.env.AX_USE_FIXTURES === "true";

@Controller("api")
export class PageController {
  private readonly guard = new SsrfGuard();
  private readonly fetcher = new PageFetcher(this.guard);
  private readonly fixtures = new FixtureStore();
  // Lives for the controller's lifetime, so a page with several forwarded
  // links doesn't refetch them on every preview render (NIM-51) — the
  // target page itself is never cached this way (ADR-0001); a forwarded
  // destination's content is not the thing being edited, so re-fetching
  // it on every keystroke buys nothing.
  private readonly forwardCache = new ForwardLinkCache();

  @Post("page")
  async page(@Body(new ZodValidationPipe(UrlRequestSchema)) body: z.infer<typeof UrlRequestSchema>) {
    return this.runTranslatingFetchFailures(() =>
      prepareHumanView(body.url, this.fetcher, new FetchBudget(), {
        fixtures: this.fixtures,
        useFixtures,
      }),
    );
  }

  @Post("render")
  async render(@Body(new ZodValidationPipe(RenderRequestSchema)) body: z.infer<typeof RenderRequestSchema>) {
    return this.runTranslatingFetchFailures(() =>
      renderPage(body.url, this.fetcher, new FetchBudget(), {
        fixtures: this.fixtures,
        useFixtures,
        modifications: body.modifications,
        forwardCache: this.forwardCache,
      }),
    );
  }

  // Lets the client know whether to show the dev mutation control at all
  // — it only works against the fixture-backed demo pages, so there's no
  // point offering it when this server instance is pointed at the real
  // network (AX_USE_FIXTURES unset).
  @Get("dev/enabled")
  devEnabled() {
    return { enabled: useFixtures };
  }

  // NIM-54's last acceptance criterion: a real page won't change shape on
  // command, so drift/re-anchor/stale resolution has nothing to
  // demonstrate against without a way to mutate one deliberately. Applies
  // only to the fixture store's in-memory copy (FixtureStore.mutate) —
  // gated behind useFixtures the same way the demo pages themselves are,
  // since there is no committed fixture for the real network to mutate.
  @Post("dev/mutate")
  devMutate(@Body(new ZodValidationPipe(DevMutateRequestSchema)) body: z.infer<typeof DevMutateRequestSchema>) {
    if (!useFixtures) {
      throw new HttpException("Dev mutation is only available with fixtures enabled", HttpStatus.FORBIDDEN);
    }
    try {
      this.fixtures.mutate(body.url, (document) => applyDevMutations(document, body.mutations));
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
    return { ok: true };
  }

  @Post("dev/reset")
  devReset(@Body(new ZodValidationPipe(UrlRequestSchema)) body: z.infer<typeof UrlRequestSchema>) {
    if (!useFixtures) {
      throw new HttpException("Dev mutation is only available with fixtures enabled", HttpStatus.FORBIDDEN);
    }
    this.fixtures.reset(body.url);
    return { ok: true };
  }

  /** Runs the pipeline call and translates a FetchFailure into an HTTP response; not just error handling, the actual execution too. */
  private async runTranslatingFetchFailures<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof FetchFailure) {
        throw new HttpException({ reason: err.reason }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw err;
    }
  }
}
