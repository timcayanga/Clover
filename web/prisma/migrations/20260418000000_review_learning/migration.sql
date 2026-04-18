-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending_review', 'suggested', 'confirmed', 'edited', 'rejected', 'duplicate_skipped');

-- AlterTable
ALTER TABLE "StatementTemplate" ADD COLUMN "fileType" TEXT;
ALTER TABLE "StatementTemplate" ADD COLUMN "parserConfig" JSONB;
ALTER TABLE "StatementTemplate" ADD COLUMN "successCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StatementTemplate" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Transaction" ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'suggested';
ALTER TABLE "Transaction" ADD COLUMN "parserConfidence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "categoryConfidence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "accountMatchConfidence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "duplicateConfidence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "transferConfidence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "rawPayload" JSONB;
ALTER TABLE "Transaction" ADD COLUMN "normalizedPayload" JSONB;
ALTER TABLE "Transaction" ADD COLUMN "learnedRuleIdsApplied" JSONB;

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "merchantPattern" TEXT,
    "normalizedName" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "timesConfirmed" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- Backfill
UPDATE "Transaction"
SET
  "reviewStatus" = CASE WHEN "categoryId" IS NULL THEN 'pending_review'::"ReviewStatus" ELSE 'confirmed'::"ReviewStatus" END,
  "parserConfidence" = 100,
  "categoryConfidence" = CASE WHEN "categoryId" IS NULL THEN 40 ELSE 100 END,
  "accountMatchConfidence" = 100,
  "duplicateConfidence" = 0,
  "transferConfidence" = CASE WHEN "isTransfer" = true THEN 100 ELSE 0 END;

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_workspaceId_merchantKey_key" ON "MerchantRule"("workspaceId", "merchantKey");
CREATE INDEX "MerchantRule_workspaceId_idx" ON "MerchantRule"("workspaceId");
CREATE INDEX "MerchantRule_merchantKey_idx" ON "MerchantRule"("merchantKey");

-- CreateIndex
CREATE INDEX "Transaction_reviewStatus_idx" ON "Transaction"("reviewStatus");

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
