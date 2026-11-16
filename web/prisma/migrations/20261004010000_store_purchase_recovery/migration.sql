CREATE TABLE "StorePurchaseRecovery" (
  "id" TEXT NOT NULL,
  "sourceClerkUserId" TEXT NOT NULL,
  "targetClerkUserId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "transactionHash" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorePurchaseRecovery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StorePurchaseRecovery_sourceClerkUserId_appId_key" ON "StorePurchaseRecovery"("sourceClerkUserId", "appId");
CREATE INDEX "StorePurchaseRecovery_targetClerkUserId_idx" ON "StorePurchaseRecovery"("targetClerkUserId");
