import { Module } from "@nestjs/common";
import { GoalsModule } from "../goals/goals.module.js";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsService } from "./transactions.service.js";

@Module({
  imports: [GoalsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService]
})
export class TransactionsModule {}
