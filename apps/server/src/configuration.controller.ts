import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Configuration, ModificationSchema } from "@ax/schema";
import { ZodValidationPipe } from "./zod-validation.pipe";
import { normalizeUrl } from "./url-normalize";
import { ConfigurationRepository, SqliteConfigurationRepository } from "./configuration-repository";

const UrlRequestSchema = z.object({ url: z.string().url() });

const SaveConfigurationRequestSchema = UrlRequestSchema.extend({
  modifications: z.array(ModificationSchema),
});

@Controller("api")
export class ConfigurationController {
  private readonly repository: ConfigurationRepository = new SqliteConfigurationRepository();

  @Post("configuration")
  save(
    @Body(new ZodValidationPipe(SaveConfigurationRequestSchema)) body: z.infer<typeof SaveConfigurationRequestSchema>,
  ): Configuration {
    const { normalized, original } = normalizeUrl(body.url);
    const configuration: Configuration = {
      version: 1,
      url: normalized,
      originalUrl: original,
      updatedAt: new Date().toISOString(),
      modifications: body.modifications,
    };
    this.repository.save(configuration);
    return configuration;
  }

  @Get("configuration")
  get(
    @Query(new ZodValidationPipe(UrlRequestSchema)) query: z.infer<typeof UrlRequestSchema>,
  ): { configuration: Configuration | null } {
    const { normalized } = normalizeUrl(query.url);
    return { configuration: this.repository.get(normalized) };
  }
}
