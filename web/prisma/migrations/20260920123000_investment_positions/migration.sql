CREATE TABLE "InvestmentPosition" (
 "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE,
 "assetKey" TEXT NOT NULL, "assetName" TEXT NOT NULL, "symbol" TEXT, "subtype" TEXT NOT NULL,
 "currency" TEXT NOT NULL, "openingDate" DATE NOT NULL,
 "openingQuantity" DECIMAL(18,8) NOT NULL, "openingCostBasis" DECIMAL(18,2) NOT NULL,
 "quantity" DECIMAL(18,8) NOT NULL, "costBasis" DECIMAL(18,2) NOT NULL,
 "value" DECIMAL(18,2), "valueDate" DATE, "sourceHoldingId" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InvestmentPosition_values_check" CHECK ("openingQuantity">=0 AND "openingCostBasis">=0 AND "quantity">=0 AND "costBasis">=0 AND ("value" IS NULL OR "value">=0))
);
CREATE UNIQUE INDEX "InvestmentPosition_accountId_assetKey_currency_key" ON "InvestmentPosition"("accountId","assetKey","currency");
ALTER TABLE "InvestmentTrade" ADD COLUMN "positionId" TEXT REFERENCES "InvestmentPosition"("id") ON DELETE CASCADE;
ALTER TABLE "InvestmentTrade" ADD COLUMN "transferPairId" TEXT;
CREATE INDEX "InvestmentTrade_positionId_idx" ON "InvestmentTrade"("positionId");
CREATE INDEX "InvestmentTrade_transferPairId_idx" ON "InvestmentTrade"("transferPairId");
CREATE TABLE "InvestmentPositionRevision" (
 "id" TEXT PRIMARY KEY, "positionId" TEXT NOT NULL REFERENCES "InvestmentPosition"("id") ON DELETE CASCADE,
 "actorUserId" TEXT NOT NULL, "before" JSONB, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "InvestmentPosition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvestmentPositionRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "InvestmentPosition", "InvestmentPositionRevision" FROM anon, authenticated;
