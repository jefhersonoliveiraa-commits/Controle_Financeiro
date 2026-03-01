import { Module } from "@nestjs/common";
import { GoalsModule } from "../goals/goals.module.js";
import { RecurrencesModule } from "../recurrences/recurrences.module.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [GoalsModule, RecurrencesModule],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}
