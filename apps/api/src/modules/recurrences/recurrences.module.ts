import { Module } from "@nestjs/common";
import { RecurrencesController } from "./recurrences.controller.js";
import { RecurrencesService } from "./recurrences.service.js";

@Module({
  controllers: [RecurrencesController],
  providers: [RecurrencesService],
  exports: [RecurrencesService]
})
export class RecurrencesModule {}
