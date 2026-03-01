import { apiDownload, apiRequest } from "./client";

export function getAccounts() {
  return apiRequest<
    Array<{
      id: string;
      name: string;
      type: string;
      initialBalance: number;
      initialBalanceDate: string;
      creditLimit: number | null;
      statementClosingDay?: number | null;
      statementDueDay?: number | null;
    }>
  >("/accounts");
}

export function getCategories() {
  return apiRequest<Array<{ id: string; name: string; type: string; color: string; icon: string }>>("/categories");
}

export function getParties() {
  return apiRequest<Array<{ id: string; name: string; type: "RECEIVER" | "PAYER" | "BOTH" }>>("/parties");
}

export function getTransactions(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return apiRequest<{
    total: number;
    page: number;
    pageSize: number;
    rows: Array<{
      id: string;
      description: string;
      type: "INCOME" | "EXPENSE";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      dueDate: string;
      amountPlanned: number;
      amountActual: number | null;
      category: { id: string; name: string; color: string };
      account: { id: string; name: string; type: string };
      party?: { id: string; name: string } | null;
      source?: "MANUAL" | "RECURRENCE" | "IMPORT";
      transferGroupId?: string | null;
      transferAccountId?: string | null;
      cardOwnership?: "SELF" | "THIRD_PARTY";
      thirdPartyReceivedAt?: string | null;
      cardSettledAmount?: number;
      installmentNumber?: number | null;
      installmentTotal?: number | null;
    }>;
  }>(`/transactions?${search.toString()}`);
}

export function createTransaction(input: unknown) {
  return apiRequest("/transactions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  dueDate: string;
  amount: number;
  description: string;
  note?: string;
  costCenter?: string;
  paymentMethod?: string;
  status?: "PENDING" | "PAID" | "RECEIVED";
}) {
  return apiRequest<{
    transferGroupId: string;
    outgoing: {
      id: string;
      description: string;
      type: "EXPENSE";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      dueDate: string;
      amountPlanned: number;
      amountActual: number | null;
    };
    incoming: {
      id: string;
      description: string;
      type: "INCOME";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      dueDate: string;
      amountPlanned: number;
      amountActual: number | null;
    };
  }>("/transactions/transfer", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function effectivateTransaction(id: string, input: { keepAmount: boolean; actualAmount?: number }) {
  return apiRequest(`/transactions/${id}/effectivate`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function updateTransaction(
  id: string,
  input: {
    description?: string;
    amountPlanned?: number;
    dueDate?: string;
    behavior?: "FIXED" | "VARIABLE" | "PROVISION";
    cardOwnership?: "SELF" | "THIRD_PARTY";
    editMode?: "THIS" | "THIS_AND_NEXT";
  }
) {
  return apiRequest(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function cancelTransaction(id: string) {
  return apiRequest(`/transactions/${id}`, {
    method: "DELETE"
  });
}

export function getCardStatement(params: { accountId: string; reference?: string }) {
  const search = new URLSearchParams();
  if (params.reference) search.set("reference", params.reference);
  return apiRequest<{
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
    invoice?: {
      id: string;
      accountId: string;
      reference: string;
      cycleStart: string;
      cycleEnd: string;
      dueDate: string;
      totalAmount: number;
      paidAmount: number;
      outstandingAmount: number;
      status: "OPEN" | "PARTIALLY_PAID" | "PAID";
      createdAt: string;
      updatedAt: string;
    } | null;
    payments?: Array<{
      id: string;
      invoiceId: string;
      fromAccountId: string | null;
      transferGroupId: string | null;
      paidAt: string;
      amount: number;
      note: string | null;
      origin: "MANUAL" | "MIGRATION";
      createdAt: string;
    }>;
    rows: Array<{
      id: string;
      description: string;
      type: "INCOME" | "EXPENSE";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      dueDate: string;
      amountPlanned: number;
      amountActual: number | null;
      cardSettledAmount?: number;
      cardOwnership: "SELF" | "THIRD_PARTY";
      thirdPartyReceivedAt: string | null;
      ownAmount: number;
      thirdPartyAmount: number;
      thirdPartyReceived: number;
      thirdPartyPending: number;
      splits: Array<{
        id: string;
        ownerType: "SELF" | "THIRD_PARTY";
        amount: number;
        partyId: string | null;
        partyName: string | null;
        receivedAt: string | null;
      }>;
      category: { id: string; name: string; color: string };
      account: { id: string; name: string; type: string };
      party?: { id: string; name: string } | null;
    }>;
  }>(`/transactions/cards/${params.accountId}/statement?${search.toString()}`);
}

export function getCardInvoices(params: {
  accountId: string;
  from: string;
  to: string;
  status?: "OPEN" | "PARTIALLY_PAID" | "PAID";
}) {
  const search = new URLSearchParams({
    from: params.from,
    to: params.to
  });
  if (params.status) search.set("status", params.status);

  return apiRequest<
    Array<{
      id: string;
      accountId: string;
      reference: string;
      cycleStart: string;
      cycleEnd: string;
      dueDate: string;
      totalAmount: number;
      paidAmount: number;
      outstandingAmount: number;
      status: "OPEN" | "PARTIALLY_PAID" | "PAID";
      createdAt: string;
      updatedAt: string;
    }>
  >(`/transactions/cards/${params.accountId}/invoices?${search.toString()}`);
}

export function getCardInvoicePayments(params: { accountId: string; invoiceId: string }) {
  return apiRequest<
    Array<{
      id: string;
      invoiceId: string;
      fromAccountId: string | null;
      transferGroupId: string | null;
      paidAt: string;
      amount: number;
      note: string | null;
      origin: "MANUAL" | "MIGRATION";
      createdAt: string;
    }>
  >(`/transactions/cards/${params.accountId}/invoices/${params.invoiceId}/payments`);
}

export function payCardInvoice(
  params: { accountId: string; invoiceId: string },
  input: { fromAccountId: string; amount: number; paidAt?: string; note?: string }
) {
  return apiRequest<{
    invoice: {
      id: string;
      accountId: string;
      reference: string;
      cycleStart: string;
      cycleEnd: string;
      dueDate: string;
      totalAmount: number;
      paidAmount: number;
      outstandingAmount: number;
      status: "OPEN" | "PARTIALLY_PAID" | "PAID";
      createdAt: string;
      updatedAt: string;
    };
    payment: {
      id: string;
      invoiceId: string;
      fromAccountId: string | null;
      transferGroupId: string | null;
      paidAt: string;
      amount: number;
      note: string | null;
      origin: "MANUAL" | "MIGRATION";
      createdAt: string;
    };
  }>(`/transactions/cards/${params.accountId}/invoices/${params.invoiceId}/payments`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getThirdPartyReceivables(params?: {
  reference?: string;
  status?: "ALL" | "PENDING" | "RECEIVED" | "OVERDUE";
  partyId?: string;
}) {
  const search = new URLSearchParams();
  if (params?.reference) search.set("reference", params.reference);
  if (params?.status) search.set("status", params.status);
  if (params?.partyId) search.set("partyId", params.partyId);
  return apiRequest<{
    reference: string;
    period: { startDate: string; endDate: string };
    filters: { status: "ALL" | "PENDING" | "RECEIVED" | "OVERDUE"; partyId: string | null };
    totals: {
      totalThirdParty: number;
      totalReceived: number;
      totalPending: number;
      pendingCount: number;
      receivedCount: number;
      overdueCount: number;
      dueThisWeekCount: number;
    };
    rows: Array<{
      id: string;
      transactionId: string;
      splitId: string;
      description: string;
      dueDate: string;
      amount: number;
      status: "PENDING" | "RECEIVED" | "OVERDUE";
      receivedAt: string | null;
      transactionStatus: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      account: { id: string; name: string };
      category: { id: string; name: string; color: string };
      party: { id: string; name: string } | null;
      splits: Array<{
        id: string;
        ownerType: "SELF" | "THIRD_PARTY";
        amount: number;
        partyId: string | null;
        receivedAt: string | null;
      }>;
    }>;
  }>(`/transactions/third-party-receivables?${search.toString()}`);
}

export function markThirdPartyReceived(
  id: string,
  input: { received: boolean; receivedAt?: string }
) {
  return apiRequest(`/transactions/${id}/third-party-received`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function updateCardSplits(
  id: string,
  input: {
    splits: Array<{
      ownerType: "SELF" | "THIRD_PARTY";
      amount: number;
      partyId?: string;
      receivedAt?: string;
    }>;
  }
) {
  return apiRequest(`/transactions/${id}/card-splits`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getCashflow(params: { startDate: string; endDate: string; accountIds?: string[] }) {
  const search = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate
  });
  if (params.accountIds?.length) {
    search.set("accountIds", params.accountIds.join(","));
  }
  return apiRequest<{
    openingBalance: number;
    totalLimit: number;
    rows: Array<{
      date: string;
      incomes: number;
      expenses: number;
      dayBalance: number;
      cumulativeBalance: number;
      alert: "NEGATIVE" | "LIMIT" | "OK";
    }>;
  }>(`/cashflow?${search.toString()}`);
}

export function getDayTransactions(date: string) {
  return apiRequest<
    Array<{
      id: string;
      description: string;
      type: "INCOME" | "EXPENSE";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      dueDate: string | Date;
      amountPlanned: number;
      amountActual: number | null;
      category: { id: string; name: string; color: string };
      account: { id: string; name: string; type: string };
      isProjected?: boolean;
    }>
  >(`/cashflow/day/${date}`);
}

export function getGoals() {
  return apiRequest<
    Array<{
      goalId: string;
      name: string;
      targetAmount: number;
      accumulatedAmount: number;
      remainingAmount: number;
      progressPercent: number;
      requiredMonthlyAverage: number;
      monthsRemaining: number;
    }>
  >("/goals");
}

export function getGoalDetails(id: string) {
  return apiRequest<{
    goalId: string;
    name: string;
    targetAmount: number;
    accumulatedAmount: number;
    remainingAmount: number;
    progressPercent: number;
    requiredMonthlyAverage: number;
    monthsRemaining: number;
    dueDate: string;
    saveDayOfMonth: number;
    account: { id: string; name: string };
    category: { id: string; name: string };
    totals: { plannedTotal: number; settledTotal: number; pendingTotal: number };
    transactions: Array<{
      id: string;
      description: string;
      dueDate: string;
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      amountPlanned: number;
      amountActual: number | null;
      account: string;
      category: string;
    }>;
  }>(`/goals/${id}/details`);
}

export function createGoal(input: unknown) {
  return apiRequest("/goals", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateGoal(id: string, input: unknown) {
  return apiRequest(`/goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteGoal(id: string) {
  return apiRequest(`/goals/${id}`, { method: "DELETE" });
}

export function recalculateGoal(id: string) {
  return apiRequest(`/goals/${id}/recalculate`, { method: "PATCH" });
}

export function getRecurrences() {
  return apiRequest<
    Array<{
      id: string;
      description: string;
      type: "INCOME" | "EXPENSE";
      defaultAmount: number;
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      dayOfMonth: number;
      frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY";
      startsAt: string;
      endsAt: string | null;
      autoGenerateMonthly: boolean;
      account: { id: string; name: string };
      category: { id: string; name: string };
    }>
  >("/recurrences");
}

export function createRecurrence(input: unknown) {
  return apiRequest("/recurrences", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateRecurrence(id: string, input: unknown) {
  return apiRequest(`/recurrences/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteRecurrence(id: string) {
  return apiRequest(`/recurrences/${id}`, { method: "DELETE" });
}

export function getReportsSummary(params: { startDate: string; endDate: string }) {
  const search = new URLSearchParams(params);
  return apiRequest<{
    byCategory: Array<{ category: string; color: string; total: number }>;
    byCategoryExpenses: Array<{ category: string; color: string; total: number }>;
    byCategoryIncomes: Array<{ category: string; color: string; total: number }>;
    plannedVsReal: { planned: number; real: number; variance: number };
    rangeTotals: {
      plannedIncome: number;
      plannedExpense: number;
      plannedBalance: number;
      realIncome: number;
      realExpense: number;
      realBalance: number;
    };
    behaviorSplit: { fixed: number; variable: number; provision: number };
    monthComparison: {
      current: {
        key: string;
        month: string;
        income: number;
        expense: number;
        balance: number;
        realIncome: number;
        realExpense: number;
        realBalance: number;
      };
      previous: {
        key: string;
        month: string;
        income: number;
        expense: number;
        balance: number;
        realIncome: number;
        realExpense: number;
        realBalance: number;
      };
      deltas: {
        income: number;
        expense: number;
        balance: number;
        realBalance: number;
      };
    };
    monthlyEvolution: Array<{
      key: string;
      month: string;
      income: number;
      expense: number;
      balance: number;
      realIncome: number;
      realExpense: number;
      realBalance: number;
    }>;
    upcoming7: Array<{ id: string; dueDate: string; description: string; type: string; amountPlanned: number }>;
    upcoming30: Array<{ id: string; dueDate: string; description: string; type: string; amountPlanned: number }>;
    goals: Array<{
      goalId: string;
      name: string;
      targetAmount: number;
      accumulatedAmount: number;
      progressPercent: number;
      remainingAmount: number;
      requiredMonthlyAverage: number;
      monthsRemaining: number;
    }>;
  }>(`/reports/summary?${search.toString()}`);
}

export function getReportsHealth(params: { startDate: string; endDate: string }) {
  const search = new URLSearchParams(params);
  return apiRequest<{
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
    score: { value: number; level: "CRITICAL" | "ATTENTION" | "STABLE" | "HEALTHY" };
    alerts: string[];
    trends: Array<{
      month: string;
      savingsRate: number;
      commitmentRate: number;
      fixedExpenseRate: number;
      pendingRate: number;
      score: number;
    }>;
  }>(`/reports/health?${search.toString()}`);
}

export function getCategoryBudgets(params?: { monthReference?: string }) {
  const search = new URLSearchParams();
  if (params?.monthReference) search.set("monthReference", params.monthReference);
  return apiRequest<
    Array<{
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
      alertLevel: "NONE" | "WARNING" | "CRITICAL" | "EXCEEDED";
    }>
  >(`/budgets/categories?${search.toString()}`);
}

export function createCategoryBudget(input: {
  categoryId: string;
  monthReference: string;
  limitAmount: number;
  warningThreshold?: number;
  criticalThreshold?: number;
}) {
  return apiRequest("/budgets/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCategoryBudget(
  id: string,
  input: {
    limitAmount?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
  }
) {
  return apiRequest(`/budgets/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteCategoryBudget(id: string) {
  return apiRequest(`/budgets/categories/${id}`, {
    method: "DELETE"
  });
}

export function getBudgetsOverview(params?: { monthReference?: string }) {
  const search = new URLSearchParams();
  if (params?.monthReference) search.set("monthReference", params.monthReference);
  return apiRequest<{
    monthReference: string;
    totals: {
      budgetCount: number;
      overBudgetCount: number;
      totalLimit: number;
      totalSpent: number;
      totalPending: number;
      totalProjected: number;
      totalRemaining: number;
    };
    items: Array<{
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
      alertLevel: "NONE" | "WARNING" | "CRITICAL" | "EXCEEDED";
    }>;
  }>(`/budgets/overview?${search.toString()}`);
}

export function getBudgetAlerts(params?: { monthReference?: string }) {
  const search = new URLSearchParams();
  if (params?.monthReference) search.set("monthReference", params.monthReference);
  return apiRequest<
    Array<{
      id: string;
      monthReference: string;
      level: "WARNING" | "CRITICAL" | "EXCEEDED";
      categoryId: string;
      categoryName: string;
      limitAmount: number;
      spent: number;
      projected: number;
      thresholdPercent: number;
      message: string;
      dismissedAt: string | null;
    }>
  >(`/budgets/alerts?${search.toString()}`);
}

export function dismissBudgetAlert(id: string, dismissed = true) {
  return apiRequest(`/budgets/alerts/${id}/dismiss`, {
    method: "PATCH",
    body: JSON.stringify({ dismissed })
  });
}

export function getInstallmentPlans() {
  return apiRequest<
    Array<{
      planId: string;
      description: string;
      installments: number;
      totalAmount: number;
      installmentAmount: number | null;
      frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY";
      isVariable: boolean;
      startDate: string;
      createdAt: string;
      account: { id: string; name: string };
      category: { id: string; name: string };
      summary: {
        paidCount: number;
        pendingCount: number;
        canceledCount: number;
        paidTotal: number;
        remainingTotal: number;
        progressPercent: number;
      };
      nextInstallment: {
        id: string;
        dueDate: string;
        installmentNumber: number | null;
        amountPlanned: number;
      } | null;
    }>
  >("/transactions/installment-plans");
}

export function getInstallmentPlanDetails(id: string) {
  return apiRequest<{
    planId: string;
    description: string;
    installments: number;
    totalAmount: number;
    installmentAmount: number | null;
    frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY";
    isVariable: boolean;
    startDate: string;
    createdAt: string;
    account: { id: string; name: string };
    category: { id: string; name: string };
    summary: {
      paidCount: number;
      pendingCount: number;
      canceledCount: number;
      paidTotal: number;
      remainingTotal: number;
      progressPercent: number;
    };
    nextInstallment: {
      id: string;
      dueDate: string;
      installmentNumber: number | null;
      amountPlanned: number;
    } | null;
    transactions: Array<{
      id: string;
      description: string;
      type: "INCOME" | "EXPENSE";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      dueDate: string;
      amountPlanned: number;
      amountActual: number | null;
      category: { id: string; name: string; color: string };
      account: { id: string; name: string; type: string };
      installmentNumber?: number | null;
      installmentTotal?: number | null;
    }>;
  }>(`/transactions/installment-plans/${id}`);
}

export function createAccount(input: unknown) {
  return apiRequest("/accounts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAccount(id: string, input: unknown) {
  return apiRequest(`/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteAccount(id: string) {
  return apiRequest(`/accounts/${id}`, { method: "DELETE" });
}

export function createCategory(input: unknown) {
  return apiRequest("/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCategory(id: string, input: unknown) {
  return apiRequest(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteCategory(id: string) {
  return apiRequest(`/categories/${id}`, { method: "DELETE" });
}

export function createParty(input: unknown) {
  return apiRequest("/parties", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateParty(id: string, input: unknown) {
  return apiRequest(`/parties/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteParty(id: string) {
  return apiRequest(`/parties/${id}`, { method: "DELETE" });
}

export async function downloadTransactionsCsv(params: { startDate: string; endDate: string }) {
  const search = new URLSearchParams(params);
  return apiDownload(`/exports/transactions.csv?${search.toString()}`);
}

export async function downloadTransactionsXlsx(params: { startDate: string; endDate: string }) {
  const search = new URLSearchParams(params);
  return apiDownload(`/exports/transactions.xlsx?${search.toString()}`);
}

export function previewImportedTransactions(input: {
  inputFormat?: "CSV" | "OFX";
  fileName: string;
  fileContent?: string;
  csvContent?: string;
  ofxContent?: string;
  delimiter?: "," | ";" | "\t";
  hasHeader?: boolean;
  accountId: string;
  defaultType?: "INCOME" | "EXPENSE";
  defaultBehavior?: "FIXED" | "VARIABLE" | "PROVISION";
  defaultStatus?: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  defaultCategoryId?: string;
}) {
  return apiRequest<{
    fileName: string;
    inputFormat: "CSV" | "OFX";
    totalRows: number;
    validRows: number;
    duplicateRows: number;
    invalidRows: number;
    rows: Array<{
      rowNumber: number;
      date: string;
      description: string;
      amount: number;
      type: "INCOME" | "EXPENSE";
      sourceFormat?: "CSV" | "OFX";
      externalRef?: string;
      memo?: string;
      bankId?: string;
      accountRef?: string;
      categoryId?: string;
      suggestedCategoryId?: string;
      suggestionConfidence?: number;
      isTransfer?: boolean;
      transferAccountId?: string;
      status: "VALID" | "DUPLICATE" | "INVALID";
      duplicateOfTransactionId?: string;
      suggestedReconcileTransactionId?: string;
      errors: string[];
      hash: string;
    }>;
  }>("/imports/transactions/preview", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function commitImportedTransactions(input: {
  fileName: string;
  accountId: string;
  rows: Array<{
    date: string;
    description: string;
    amount: number;
    type: "INCOME" | "EXPENSE";
    sourceFormat?: "CSV" | "OFX";
    externalRef?: string;
    memo?: string;
    bankId?: string;
    accountRef?: string;
    categoryId?: string;
    suggestedCategoryId?: string;
    suggestionConfidence?: number;
    partyId?: string;
    note?: string;
    paymentMethod?: string;
    costCenter?: string;
    behavior?: "FIXED" | "VARIABLE" | "PROVISION";
    isTransfer?: boolean;
    transferAccountId?: string;
  }>;
  dedupe?: boolean;
  reconcileMatches?: boolean;
  defaultBehavior?: "FIXED" | "VARIABLE" | "PROVISION";
  defaultStatus?: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  source?: "IMPORT";
}) {
  return apiRequest<{
    batchId: string;
    importedCount: number;
    skippedCount: number;
    reconciledCount: number;
    createdTransactionIds: string[];
  }>("/imports/transactions/commit", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
