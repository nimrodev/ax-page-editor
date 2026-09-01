import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PageController } from "./page.controller";
import { ConfigurationController } from "./configuration.controller";

@Module({
  controllers: [AppController, PageController, ConfigurationController],
})
export class AppModule {}
