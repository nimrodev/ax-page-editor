import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { RenderController } from "./render.controller";

@Module({
  controllers: [AppController, RenderController],
})
export class AppModule {}
