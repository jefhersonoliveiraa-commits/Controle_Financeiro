import { Module } from "@nestjs/common";
import { RecurrencesModule } from "../recurrences/recurrences.module.js";
import { CashflowController } from "./cashflow.controller.js";
import { CashflowService } from "./cashflow.service.js";

@Module({
  imports: [RecurrencesModule],
  controllers: [CashflowController],
  providers: [CashflowService]
})
export class CashflowModule {}
