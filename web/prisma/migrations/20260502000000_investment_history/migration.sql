-- CreateTable
CREATE TABLE "InvestmentPurchase" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,8),
    "totalCost" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentDividend" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentDividend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentPurchase_accountId_idx" ON "InvestmentPurchase"("accountId");
CREATE INDEX "InvestmentPurchase_purchasedAt_idx" ON "InvestmentPurchase"("purchasedAt");
CREATE INDEX "InvestmentDividend_accountId_idx" ON "InvestmentDividend"("accountId");
CREATE INDEX "InvestmentDividend_paidAt_idx" ON "InvestmentDividend"("paidAt");

-- AddForeignKey
ALTER TABLE "InvestmentPurchase" ADD CONSTRAINT "InvestmentPurchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentDividend" ADD CONSTRAINT "InvestmentDividend_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
