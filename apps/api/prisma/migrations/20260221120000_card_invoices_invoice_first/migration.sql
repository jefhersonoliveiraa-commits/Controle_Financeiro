-- CreateEnum
CREATE TYPE "CardInvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "CardInvoicePaymentOrigin" AS ENUM ('MANUAL', 'MIGRATION');

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "cardInvoiceId" TEXT,
ADD COLUMN "cardSettledAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CardInvoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "CardInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInvoicePayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fromAccountId" TEXT,
    "transferGroupId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "origin" "CardInvoicePaymentOrigin" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInvoicePaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amountAllocated" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardInvoicePaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardInvoice_userId_accountId_reference_key" ON "CardInvoice"("userId", "accountId", "reference");

-- CreateIndex
CREATE INDEX "CardInvoice_userId_dueDate_idx" ON "CardInvoice"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "CardInvoicePayment_userId_paidAt_idx" ON "CardInvoicePayment"("userId", "paidAt");

-- CreateIndex
CREATE INDEX "CardInvoicePayment_invoiceId_paidAt_idx" ON "CardInvoicePayment"("invoiceId", "paidAt");

-- CreateIndex
CREATE INDEX "CardInvoicePaymentAllocation_paymentId_idx" ON "CardInvoicePaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "CardInvoicePaymentAllocation_transactionId_idx" ON "CardInvoicePaymentAllocation"("transactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardInvoiceId_fkey" FOREIGN KEY ("cardInvoiceId") REFERENCES "CardInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoice" ADD CONSTRAINT "CardInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoice" ADD CONSTRAINT "CardInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoicePayment" ADD CONSTRAINT "CardInvoicePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoicePayment" ADD CONSTRAINT "CardInvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoicePayment" ADD CONSTRAINT "CardInvoicePayment_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoicePaymentAllocation" ADD CONSTRAINT "CardInvoicePaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CardInvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoicePaymentAllocation" ADD CONSTRAINT "CardInvoicePaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
