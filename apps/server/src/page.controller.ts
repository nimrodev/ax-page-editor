import { Body, Controller, HttpException, HttpStatus, Post } from "@nestjs/common";
import { z } from "zod";
import { ModificationSchema } from "@ax/schema";
import { ZodValidationPipe } from "./zod-validation.pipe";
import { renderPage, prepareHumanView } from "./render-page";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { FetchFailure } from "./fetcher";
import { FixtureStore } from "./fixture-store";

const UrlRequestSchema = z.object({ url: z.string().url() });

const RenderRequestSchema = UrlRequestSchema.extend({
  // Accepted now so the seam does not need to change shape once hide,
  // context, and link forwarding land — unapplied until then.
  modifications: z.array(ModificationSchema).optional(),
});

const useFixtures = process.env.AX_USE_FIXTURES === "1" || process.env.AX_USE_FIXTURES === "true";

@Controller("api")
export class PageController {
  private readonly guard = new SsrfGuard();
  private readonly fetcher = new PageFetcher(this.guard);
  private readonly fixtures = new FixtureStore();

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
      }),
    );
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
