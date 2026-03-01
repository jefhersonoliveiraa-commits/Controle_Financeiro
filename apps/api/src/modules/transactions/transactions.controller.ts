import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { TransactionsService } from "./transactions.service.js";

@Controller("transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post("transfer")
  async createTransfer(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.transactionsService.createTransfer(user.sub, body);
  }

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.transactionsService.create(user.sub, body);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: Record<string, unknown>) {
    return this.transactionsService.list(user.sub, query);
  }

  @Get("installment-plans")
  async listInstallmentPlans(@CurrentUser() user: JwtPayload) {
    return this.transactionsService.listInstallmentPlans(user.sub);
  }

  @Get("installment-plans/:id")
  async installmentPlanDetails(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.transactionsService.getInstallmentPlanDetails(user.sub, id);
  }

  @Get("cards/:accountId/statement")
  async cardStatement(
    @CurrentUser() user: JwtPayload,
    @Param("accountId") accountId: string,
    @Query() query: Record<string, unknown>
  ) {
    return this.transactionsService.cardStatement(user.sub, accountId, query);
  }

  @Get("cards/:accountId/invoices")
  async cardInvoices(
    @CurrentUser() user: JwtPayload,
    @Param("accountId") accountId: string,
    @Query() query: Record<string, unknown>
  ) {
    return this.transactionsService.cardInvoices(user.sub, accountId, query);
  }

  @Get("cards/:accountId/invoices/:invoiceId/payments")
  async cardInvoicePayments(
    @CurrentUser() user: JwtPayload,
    @Param("accountId") accountId: string,
    @Param("invoiceId") invoiceId: string
  ) {
    return this.transactionsService.cardInvoicePayments(user.sub, accountId, invoiceId);
  }

  @Post("cards/:accountId/invoices/:invoiceId/payments")
  async payCardInvoice(
    @CurrentUser() user: JwtPayload,
    @Param("accountId") accountId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown
  ) {
    return this.transactionsService.payCardInvoice(user.sub, accountId, invoiceId, body);
  }

  @Get("third-party-receivables")
  async thirdPartyReceivables(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>
  ) {
    return this.transactionsService.thirdPartyReceivables(user.sub, query);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.transactionsService.update(user.sub, id, body);
  }

  @Patch(":id/effectivate")
  async effectivate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.transactionsService.effectivate(user.sub, id, body);
  }

  @Patch(":id/anticipate")
  async anticipate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.transactionsService.anticipateInstallment(user.sub, id, body);
  }

  @Patch(":id/third-party-received")
  async markThirdPartyReceived(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.transactionsService.markThirdPartyReceived(user.sub, id, body);
  }

  @Patch(":id/card-splits")
  async updateCardSplits(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.transactionsService.updateCardSplits(user.sub, id, body);
  }

  @Delete(":id")
  async cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.transactionsService.cancel(user.sub, id);
  }
}
