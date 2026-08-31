import { Controller, Get } from "@nestjs/common";
import { ConfigurationSchema } from "@ax/schema";

@Controller("api")
export class AppController {
  @Get("health")
  health() {
    return {
      status: "ok",
      schemaLoaded: typeof ConfigurationSchema.parse === "function",
    };
  }
}
