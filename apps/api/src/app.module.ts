import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccountsModule } from "./modules/accounts/accounts.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { BudgetsModule } from "./modules/budgets/budgets.module.js";
import { CashflowModule } from "./modules/cashflow/cashflow.module.js";
import { CategoriesModule } from "./modules/categories/categories.module.js";
import { ExportsModule } from "./modules/exports/exports.module.js";
import { GoalsModule } from "./modules/goals/goals.module.js";
import { ImportsModule } from "./modules/imports/imports.module.js";
import { PartiesModule } from "./modules/parties/parties.module.js";
import { RecurrencesModule } from "./modules/recurrences/recurrences.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { TransactionsModule } from "./modules/transactions/transactions.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    PartiesModule,
    RecurrencesModule,
    GoalsModule,
    ImportsModule,
    TransactionsModule,
    BudgetsModule,
    CashflowModule,
    ReportsModule,
    ExportsModule
  ]
})
export class AppModule {}
