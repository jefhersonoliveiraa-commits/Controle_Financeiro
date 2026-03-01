import { Module } from "@nestjs/common";
import { RecurrencesModule } from "../recurrences/recurrences.module.js";
import { BudgetsController } from "./budgets.controller.js";
import { BudgetsService } from "./budgets.service.js";

@Module({
  imports: [RecurrencesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService]
})
export class BudgetsModule {}
