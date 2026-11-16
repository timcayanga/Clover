CREATE TABLE "InvestmentTrade" (
 "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE,
 "assetName" TEXT NOT NULL, "tradedAt" TIMESTAMP(3) NOT NULL, "kind" TEXT NOT NULL,
 "quantity" DECIMAL(18,8) NOT NULL, "amount" DECIMAL(18,2) NOT NULL,
 "costBasis" DECIMAL(18,2) NOT NULL, "currency" TEXT NOT NULL, "note" TEXT NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 1, "deletedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InvestmentTrade_kind_check" CHECK ("kind" IN ('buy','sell','reinvest','transfer_in','transfer_out')),
 CONSTRAINT "InvestmentTrade_values_check" CHECK ("quantity">0 AND "amount">=0 AND "costBasis">=0)
);
CREATE INDEX "InvestmentTrade_accountId_tradedAt_idx" ON "InvestmentTrade"("accountId","tradedAt" DESC);
CREATE TABLE "InvestmentTradeRevision" (
 "id" TEXT PRIMARY KEY, "tradeId" TEXT NOT NULL REFERENCES "InvestmentTrade"("id") ON DELETE CASCADE,
 "actorUserId" TEXT NOT NULL, "before" JSONB, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "InvestmentTrade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvestmentTradeRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "InvestmentTrade", "InvestmentTradeRevision" FROM anon, authenticated;
