import { z } from "zod";
import {
  accountTypeSchema,
  budgetAlertLevelSchema,
  cardInvoicePaymentOriginSchema,
  cardInvoiceStatusSchema,
  cardTransactionOwnerSchema,
  categoryTypeSchema,
  importInputFormatSchema,
  partyTypeSchema,
  recurrenceFrequencySchema,
  transactionBehaviorSchema,
  transactionSourceSchema,
  transactionStatusSchema,
  transactionTypeSchema
} from "./enums.js";

const moneySchema = z.coerce.number().nonnegative();
const isoDateSchema = z.string().datetime({ offset: true }).or(z.string().date());
const monthReferenceSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const createAccountSchema = z.object({
  name: z.string().min(2).max(60),
  type: accountTypeSchema,
  initialBalance: moneySchema,
  initialBalanceDate: isoDateSchema,
  limit: moneySchema.optional(),
  statementClosingDay: z.number().int().min(1).max(31).optional(),
  statementDueDay: z.number().int().min(1).max(31).optional()
});

export const updateAccountSchema = z
  .object({
    name: z.string().min(2).max(60).optional(),
    type: accountTypeSchema.optional(),
    initialBalance: moneySchema.optional(),
    initialBalanceDate: isoDateSchema.optional(),
    limit: moneySchema.nullable().optional(),
    statementClosingDay: z.number().int().min(1).max(31).nullable().optional(),
    statementDueDay: z.number().int().min(1).max(31).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export const createCategorySchema = z.object({
  name: z.string().min(2).max(60),
  type: categoryTypeSchema,
  color: z.string().min(4).max(20),
  icon: z.string().min(1).max(30)
});

export const updateCategorySchema = z
  .object({
    name: z.string().min(2).max(60).optional(),
    type: categoryTypeSchema.optional(),
    color: z.string().min(4).max(20).optional(),
    icon: z.string().min(1).max(30).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export const createPartySchema = z.object({
  name: z.string().min(2).max(120),
  type: partyTypeSchema
});

export const updatePartySchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    type: partyTypeSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  description: z.string().min(2).max(180),
  categoryId: z.string().uuid(),
  accountId: z.string().uuid(),
  partyId: z.string().uuid().optional(),
  dueDate: isoDateSchema,
  amountPlanned: moneySchema,
  status: transactionStatusSchema.default("PENDING"),
  behavior: transactionBehaviorSchema.default("FIXED"),
  note: z.string().max(500).optional(),
  costCenter: z.string().max(80).optional(),
  paymentMethod: z.string().max(40).optional(),
  provisionUntil: isoDateSchema.optional(),
  isInstallment: z.boolean().default(false),
  installment: z
    .object({
      totalAmount: moneySchema.optional(),
      installmentAmount: moneySchema.optional(),
      installments: z.number().int().min(2).max(240),
      firstDueDate: isoDateSchema,
      frequency: recurrenceFrequencySchema.default("MONTHLY"),
      variableInstallments: z.boolean().default(false)
    })
    .optional(),
  recurrenceId: z.string().uuid().optional(),
  goalId: z.string().uuid().optional(),
  cardOwnership: cardTransactionOwnerSchema.default("SELF")
});

export const createTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  dueDate: isoDateSchema,
  amount: moneySchema,
  description: z.string().min(2).max(180).default("Transferencia entre contas"),
  status: transactionStatusSchema.default("PENDING"),
  note: z.string().max(500).optional(),
  costCenter: z.string().max(80).optional(),
  paymentMethod: z.string().max(40).optional()
});

export const cardStatementQuerySchema = z.object({
  reference: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
});

export const cardInvoicesQuerySchema = z.object({
  from: monthReferenceSchema.optional(),
  to: monthReferenceSchema.optional(),
  status: cardInvoiceStatusSchema.optional()
});

export const createCardInvoicePaymentSchema = z.object({
  fromAccountId: z.string().uuid(),
  amount: moneySchema,
  paidAt: isoDateSchema.optional(),
  note: z.string().max(500).optional()
});

export const thirdPartyReceivablesQuerySchema = z.object({
  reference: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  status: z.enum(["ALL", "PENDING", "RECEIVED", "OVERDUE"]).default("ALL"),
  partyId: z.string().uuid().optional()
});

export const markThirdPartyReceivedSchema = z.object({
  received: z.boolean().default(true),
  receivedAt: isoDateSchema.optional()
});

export const importTransactionPreviewSchema = z.object({
  inputFormat: importInputFormatSchema.optional(),
  fileName: z.string().min(1).max(180),
  fileContent: z.string().optional(),
  csvContent: z.string().optional(),
  ofxContent: z.string().optional(),
  delimiter: z.enum([",", ";", "\t"]).default(","),
  hasHeader: z.boolean().default(true),
  accountId: z.string().uuid(),
  defaultType: transactionTypeSchema.default("EXPENSE"),
  defaultBehavior: transactionBehaviorSchema.default("VARIABLE"),
  defaultStatus: transactionStatusSchema.default("PENDING"),
  defaultCategoryId: z.string().uuid().optional()
});

export const importTransactionRowSchema = z.object({
  date: isoDateSchema,
  description: z.string().min(2).max(180),
  amount: moneySchema,
  type: transactionTypeSchema,
  sourceFormat: importInputFormatSchema.optional(),
  externalRef: z.string().max(180).optional(),
  memo: z.string().max(500).optional(),
  bankId: z.string().max(40).optional(),
  accountRef: z.string().max(80).optional(),
  categoryId: z.string().uuid().optional(),
  suggestedCategoryId: z.string().uuid().optional(),
  suggestionConfidence: z.coerce.number().min(0).max(1).optional(),
  partyId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
  paymentMethod: z.string().max(40).optional(),
  costCenter: z.string().max(80).optional(),
  behavior: transactionBehaviorSchema.optional(),
  isTransfer: z.boolean().optional(),
  transferAccountId: z.string().uuid().optional()
});

export const importTransactionCommitSchema = z.object({
  fileName: z.string().min(1).max(180),
  accountId: z.string().uuid(),
  rows: z.array(importTransactionRowSchema).min(1),
  dedupe: z.boolean().default(true),
  reconcileMatches: z.boolean().default(true),
  defaultBehavior: transactionBehaviorSchema.default("VARIABLE"),
  defaultStatus: transactionStatusSchema.default("PENDING"),
  source: transactionSourceSchema.default("IMPORT")
});

export const effectivateTransactionSchema = z.object({
  keepAmount: z.boolean().default(true),
  actualAmount: moneySchema.optional(),
  paidAt: isoDateSchema.optional()
});

export const cardSplitItemSchema = z
  .object({
    ownerType: cardTransactionOwnerSchema,
    amount: moneySchema,
    partyId: z.string().uuid().optional(),
    receivedAt: isoDateSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.ownerType === "THIRD_PARTY" && !value.partyId) {
      ctx.addIssue({
        path: ["partyId"],
        code: z.ZodIssueCode.custom,
        message: "Split de terceiro exige partyId."
      });
    }
    if (value.ownerType === "SELF" && value.partyId) {
      ctx.addIssue({
        path: ["partyId"],
        code: z.ZodIssueCode.custom,
        message: "Split proprio nao deve conter partyId."
      });
    }
  });

export const updateCardSplitsSchema = z.object({
  splits: z.array(cardSplitItemSchema).min(1)
});

export const cardInvoicePaymentViewSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  fromAccountId: z.string().uuid().nullable(),
  transferGroupId: z.string().nullable(),
  paidAt: z.string().datetime({ offset: true }),
  amount: moneySchema,
  note: z.string().nullable(),
  origin: cardInvoicePaymentOriginSchema,
  createdAt: z.string().datetime({ offset: true })
});

export const createCategoryBudgetSchema = z
  .object({
    categoryId: z.string().uuid(),
    monthReference: monthReferenceSchema,
    limitAmount: moneySchema,
    warningThreshold: z.coerce.number().int().min(1).max(99).default(70),
    criticalThreshold: z.coerce.number().int().min(1).max(99).default(90)
  })
  .refine((value) => value.warningThreshold < value.criticalThreshold, {
    message: "warningThreshold deve ser menor que criticalThreshold.",
    path: ["warningThreshold"]
  });

export const updateCategoryBudgetSchema = z
  .object({
    limitAmount: moneySchema.optional(),
    warningThreshold: z.coerce.number().int().min(1).max(99).optional(),
    criticalThreshold: z.coerce.number().int().min(1).max(99).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  })
  .superRefine((value, ctx) => {
    if (
      value.warningThreshold !== undefined &&
      value.criticalThreshold !== undefined &&
      value.warningThreshold >= value.criticalThreshold
    ) {
      ctx.addIssue({
        path: ["warningThreshold"],
        code: z.ZodIssueCode.custom,
        message: "warningThreshold deve ser menor que criticalThreshold."
      });
    }
  });

export const budgetsQuerySchema = z.object({
  monthReference: monthReferenceSchema.optional()
});

export const dismissBudgetAlertSchema = z.object({
  dismissed: z.boolean().default(true)
});

export const budgetAlertViewSchema = z.object({
  id: z.string().uuid(),
  monthReference: monthReferenceSchema,
  level: budgetAlertLevelSchema,
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  limitAmount: moneySchema,
  spent: moneySchema,
  projected: moneySchema,
  thresholdPercent: z.number().int().min(1).max(100),
  message: z.string(),
  dismissedAt: z.string().datetime({ offset: true }).nullable()
});

export const createRecurrenceSchema = z.object({
  type: transactionTypeSchema,
  description: z.string().min(2).max(180),
  defaultAmount: moneySchema,
  behavior: transactionBehaviorSchema,
  dayOfMonth: z.number().int().min(1).max(31),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  startsAt: isoDateSchema,
  endsAt: isoDateSchema.optional(),
  frequency: recurrenceFrequencySchema.default("MONTHLY"),
  autoGenerateMonthly: z.boolean().default(true)
});

export const updateRecurrenceSchema = z
  .object({
    type: transactionTypeSchema.optional(),
    description: z.string().min(2).max(180).optional(),
    defaultAmount: moneySchema.optional(),
    behavior: transactionBehaviorSchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    startsAt: isoDateSchema.optional(),
    endsAt: isoDateSchema.nullable().optional(),
    frequency: recurrenceFrequencySchema.optional(),
    autoGenerateMonthly: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export const createGoalSchema = z.object({
  name: z.string().min(2).max(120),
  targetAmount: moneySchema,
  accumulatedAmount: moneySchema.default(0),
  dueDate: isoDateSchema,
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  saveDayOfMonth: z.number().int().min(1).max(31)
});

export const updateGoalSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    targetAmount: moneySchema.optional(),
    dueDate: isoDateSchema.optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    saveDayOfMonth: z.number().int().min(1).max(31).optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "CANCELED"]).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export const cashflowQuerySchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  accountIds: z.array(z.string().uuid()).optional(),
  includeCanceled: z.boolean().default(false)
});

export const reportRangeQuerySchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema
});

export const healthReportQuerySchema = reportRangeQuerySchema;

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type ImportTransactionPreviewInput = z.infer<typeof importTransactionPreviewSchema>;
export type ImportTransactionRowInput = z.infer<typeof importTransactionRowSchema>;
export type ImportTransactionCommitInput = z.infer<typeof importTransactionCommitSchema>;
export type EffectivateTransactionInput = z.infer<typeof effectivateTransactionSchema>;
export type CardStatementQueryInput = z.infer<typeof cardStatementQuerySchema>;
export type CardInvoicesQueryInput = z.infer<typeof cardInvoicesQuerySchema>;
export type CreateCardInvoicePaymentInput = z.infer<typeof createCardInvoicePaymentSchema>;
export type ThirdPartyReceivablesQueryInput = z.infer<typeof thirdPartyReceivablesQuerySchema>;
export type MarkThirdPartyReceivedInput = z.infer<typeof markThirdPartyReceivedSchema>;
export type UpdateCardSplitsInput = z.infer<typeof updateCardSplitsSchema>;
export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CashflowQueryInput = z.infer<typeof cashflowQuerySchema>;
export type ReportRangeQueryInput = z.infer<typeof reportRangeQuerySchema>;
export type HealthReportQueryInput = z.infer<typeof healthReportQuerySchema>;
export type CreateCategoryBudgetInput = z.infer<typeof createCategoryBudgetSchema>;
export type UpdateCategoryBudgetInput = z.infer<typeof updateCategoryBudgetSchema>;
export type BudgetsQueryInput = z.infer<typeof budgetsQuerySchema>;
export type DismissBudgetAlertInput = z.infer<typeof dismissBudgetAlertSchema>;
