-- CreateEnum
CREATE TYPE "BudgetAlertLevel" AS ENUM ('WARNING', 'CRITICAL', 'EXCEEDED');

-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthReference" TIMESTAMP(3) NOT NULL,
    "limitAmount" DECIMAL(65,30) NOT NULL,
    "warningThreshold" INTEGER NOT NULL DEFAULT 70,
    "criticalThreshold" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "monthReference" TIMESTAMP(3) NOT NULL,
    "level" "BudgetAlertLevel" NOT NULL,
    "thresholdPercent" INTEGER NOT NULL,
    "spentAmount" DECIMAL(65,30) NOT NULL,
    "projectedAmount" DECIMAL(65,30) NOT NULL,
    "limitAmount" DECIMAL(65,30) NOT NULL,
    "message" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCardSplit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "ownerType" "CardTransactionOwner" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "partyId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCardSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_userId_categoryId_monthReference_key" ON "CategoryBudget"("userId", "categoryId", "monthReference");

-- CreateIndex
CREATE INDEX "CategoryBudget_userId_monthReference_idx" ON "CategoryBudget"("userId", "monthReference");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlert_budgetId_monthReference_level_key" ON "BudgetAlert"("budgetId", "monthReference", "level");

-- CreateIndex
CREATE INDEX "BudgetAlert_userId_monthReference_dismissedAt_idx" ON "BudgetAlert"("userId", "monthReference", "dismissedAt");

-- CreateIndex
CREATE INDEX "TransactionCardSplit_transactionId_ownerType_idx" ON "TransactionCardSplit"("transactionId", "ownerType");

-- CreateIndex
CREATE INDEX "TransactionCardSplit_userId_partyId_idx" ON "TransactionCardSplit"("userId", "partyId");

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "CategoryBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCardSplit" ADD CONSTRAINT "TransactionCardSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCardSplit" ADD CONSTRAINT "TransactionCardSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCardSplit" ADD CONSTRAINT "TransactionCardSplit_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy credit card expense ownership into split rows.
INSERT INTO "TransactionCardSplit" (
    "id",
    "userId",
    "transactionId",
    "ownerType",
    "amount",
    "partyId",
    "receivedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('legacy-split-', t."id"),
    t."userId",
    t."id",
    t."cardOwnership",
    t."amountPlanned",
    CASE WHEN t."cardOwnership" = 'THIRD_PARTY' THEN t."partyId" ELSE NULL END,
    CASE WHEN t."cardOwnership" = 'THIRD_PARTY' THEN t."thirdPartyReceivedAt" ELSE NULL END,
    t."createdAt",
    t."updatedAt"
FROM "Transaction" t
JOIN "Account" a ON a."id" = t."accountId"
WHERE a."type" = 'CREDIT_CARD'
  AND t."type" = 'EXPENSE'
  AND NOT EXISTS (
      SELECT 1 FROM "TransactionCardSplit" s WHERE s."transactionId" = t."id"
  );
