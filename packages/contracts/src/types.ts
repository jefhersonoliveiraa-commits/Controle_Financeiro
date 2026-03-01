import type {
  BudgetAlertLevel,
  CardInvoicePaymentOrigin,
  CardInvoiceStatus,
  CardTransactionOwner,
  ImportInputFormat,
  TransactionBehavior,
  TransactionSource,
  TransactionStatus,
  TransactionType
} from "./enums.js";

export type DailyCashflowRow = {
  date: string;
  incomes: number;
  expenses: number;
  dayBalance: number;
  cumulativeBalance: number;
  alert: "NEGATIVE" | "LIMIT" | "OK";
};

export type ForecastTransactionView = {
  id: string;
  description: string;
  type: TransactionType;
  behavior: TransactionBehavior;
  status: TransactionStatus;
  dueDate: string;
  amountPlanned: number;
  amountActual?: number | null;
  category: string;
  account: string;
};

export type GoalProgressView = {
  goalId: string;
  name: string;
  targetAmount: number;
  accumulatedAmount: number;
  remainingAmount: number;
  progressPercent: number;
  requiredMonthlyAverage: number;
  monthsRemaining: number;
};

export type HealthTrendRow = {
  month: string;
  savingsRate: number;
  commitmentRate: number;
  fixedExpenseRate: number;
  pendingRate: number;
  score: number;
};

export type HealthReport = {
  period: { startDate: string; endDate: string };
  kpis: {
    savingsRate: number;
    commitmentRate: number;
    cashCoverageMonths: number;
    fixedExpenseRate: number;
    pendingRate: number;
    totalIncome: number;
    totalExpense: number;
    totalPending: number;
  };
  score: {
    value: number;
    level: "CRITICAL" | "ATTENTION" | "STABLE" | "HEALTHY";
  };
  alerts: string[];
  trends: HealthTrendRow[];
};

export type ImportPreviewItem = {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  sourceFormat?: ImportInputFormat;
  externalRef?: string;
  memo?: string;
  bankId?: string;
  accountRef?: string;
  categoryId?: string;
  categoryName?: string;
  suggestedCategoryId?: string;
  suggestionConfidence?: number;
  isTransfer?: boolean;
  transferAccountId?: string;
  status: "VALID" | "DUPLICATE" | "INVALID";
  duplicateOfTransactionId?: string;
  suggestedReconcileTransactionId?: string;
  errors: string[];
  hash: string;
};

export type ImportCommitResult = {
  batchId: string;
  importedCount: number;
  skippedCount: number;
  reconciledCount: number;
  createdTransactionIds: string[];
};

export type CardStatementTransactionItem = {
  id: string;
  ownerType: CardTransactionOwner;
  amount: number;
  partyId?: string | null;
  partyName?: string | null;
  receivedAt: string | null;
};

export type CardStatementRowItem = {
  id: string;
  description: string;
  type: TransactionType;
  behavior: TransactionBehavior;
  dueDate: string;
  status: TransactionStatus;
  amountPlanned: number;
  amountActual: number | null;
  cardSettledAmount?: number;
  cardOwnership: CardTransactionOwner;
  thirdPartyReceivedAt: string | null;
  ownAmount: number;
  thirdPartyAmount: number;
  thirdPartyReceived: number;
  thirdPartyPending: number;
  splits: CardStatementTransactionItem[];
  category: { id: string; name: string; color: string };
  account: { id: string; name: string; type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD" };
  party?: { id: string; name: string } | null;
};

export type CardInvoicePaymentItem = {
  id: string;
  invoiceId: string;
  fromAccountId: string | null;
  transferGroupId: string | null;
  paidAt: string;
  amount: number;
  note: string | null;
  origin: CardInvoicePaymentOrigin;
  createdAt: string;
};

export type CardInvoiceItem = {
  id: string;
  accountId: string;
  reference: string;
  cycleStart: string;
  cycleEnd: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: CardInvoiceStatus;
  createdAt: string;
  updatedAt: string;
};

export type CardStatementReport = {
  reference: string;
  period: { startDate: string; endDate: string };
  account: {
    id: string;
    name: string;
    type: "CREDIT_CARD";
    statementClosingDay: number | null;
    statementDueDay: number | null;
  };
  totals: {
    totalInvoice: number;
    ownExpenses: number;
    thirdPartyExpenses: number;
    thirdPartyReceived: number;
    thirdPartyPending: number;
    netToPay: number;
  };
  invoice?: CardInvoiceItem | null;
  payments?: CardInvoicePaymentItem[];
  rows: CardStatementRowItem[];
};

export type CategoryBudgetView = {
  id: string;
  categoryId: string;
  categoryName: string;
  monthReference: string;
  limitAmount: number;
  warningThreshold: number;
  criticalThreshold: number;
  spent: number;
  pending: number;
  projected: number;
  remaining: number;
  utilizationPercent: number;
  projectedUtilizationPercent: number;
  alertLevel: BudgetAlertLevel | "NONE";
};

export type BudgetAlertView = {
  id: string;
  monthReference: string;
  level: BudgetAlertLevel;
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spent: number;
  projected: number;
  thresholdPercent: number;
  message: string;
  dismissedAt: string | null;
};

export type TransactionAuditView = {
  id: string;
  source: TransactionSource;
  transferGroupId?: string | null;
  externalHash?: string | null;
  reconciledAt?: string | null;
};
