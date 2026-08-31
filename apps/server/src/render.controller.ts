import { Body, Controller, HttpException, HttpStatus, Post } from "@nestjs/common";
import { z } from "zod";
import { ModificationSchema } from "@ax/schema";
import { ZodValidationPipe } from "./zod-validation.pipe";
import { renderPage } from "./render-page";
import { PageFetcher } from "./fetcher";
import { SsrfGuard } from "./ssrf-guard";
import { FetchBudget } from "./fetch-budget";
import { FetchFailure } from "./fetcher";
import { FixtureStore } from "./fixture-store";

const RenderRequestSchema = z.object({
  url: z.string().url(),
  // Accepted now so the seam does not need to change shape once hide,
  // context, and link forwarding land — unapplied until then.
  modifications: z.array(ModificationSchema).optional(),
});

const useFixtures = process.env.AX_USE_FIXTURES === "1" || process.env.AX_USE_FIXTURES === "true";

@Controller("api")
export class RenderController {
  private readonly guard = new SsrfGuard();
  private readonly fetcher = new PageFetcher(this.guard);
  private readonly fixtures = new FixtureStore();

  @Post("render")
  async render(@Body(new ZodValidationPipe(RenderRequestSchema)) body: z.infer<typeof RenderRequestSchema>) {
    try {
      return await renderPage(body.url, this.fetcher, new FetchBudget(), {
        fixtures: this.fixtures,
        useFixtures,
      });
    } catch (err) {
      if (err instanceof FetchFailure) {
        throw new HttpException({ reason: err.reason }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw err;
    }
  }
}
