-- CreateEnum
CREATE TYPE "CardTransactionOwner" AS ENUM ('SELF', 'THIRD_PARTY');

-- AlterTable
ALTER TABLE "Transaction"
  ADD COLUMN "transferAccountId" TEXT,
  ADD COLUMN "transferGroupId" TEXT,
  ADD COLUMN "cardOwnership" "CardTransactionOwner" NOT NULL DEFAULT 'SELF',
  ADD COLUMN "thirdPartyReceivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Transaction_userId_accountId_dueDate_idx" ON "Transaction"("userId", "accountId", "dueDate");

-- CreateIndex
CREATE INDEX "Transaction_userId_transferGroupId_idx" ON "Transaction"("userId", "transferGroupId");

-- CreateIndex
CREATE INDEX "Transaction_cardOwnership_idx" ON "Transaction"("cardOwnership");

-- AddForeignKey
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_transferAccountId_fkey"
  FOREIGN KEY ("transferAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
