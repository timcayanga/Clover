-- CreateEnum
CREATE TYPE "TrainingSignalSource" AS ENUM ('import_confirmation', 'manual_recategorization', 'training_upload', 'manual_transaction_creation');

-- AlterTable
ALTER TABLE "ParsedTransaction" ADD COLUMN "institution" TEXT;
ALTER TABLE "ParsedTransaction" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "ParsedTransaction" ADD COLUMN "merchantClean" TEXT;
ALTER TABLE "ParsedTransaction" ADD COLUMN "confidence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ParsedTransaction" ADD COLUMN "categoryReason" TEXT;
ALTER TABLE "ParsedTransaction" ADD COLUMN "parserVersion" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "ParsedTransaction" ADD COLUMN "statementFingerprint" TEXT;

-- CreateTable
CREATE TABLE "StatementTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "institution" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "parserVersion" TEXT NOT NULL DEFAULT 'v1',
    "exampleCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "transactionId" TEXT,
    "importFileId" TEXT,
    "source" "TrainingSignalSource" NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "merchantTokens" JSONB,
    "categoryId" TEXT NOT NULL,
    "categoryName" TEXT,
    "type" "TransactionType" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementTemplate_workspaceId_fingerprint_key" ON "StatementTemplate"("workspaceId", "fingerprint");
CREATE INDEX "StatementTemplate_workspaceId_idx" ON "StatementTemplate"("workspaceId");
CREATE INDEX "ParsedTransaction_statementFingerprint_idx" ON "ParsedTransaction"("statementFingerprint");
CREATE INDEX "TrainingSignal_workspaceId_idx" ON "TrainingSignal"("workspaceId");
CREATE INDEX "TrainingSignal_transactionId_idx" ON "TrainingSignal"("transactionId");
CREATE INDEX "TrainingSignal_importFileId_idx" ON "TrainingSignal"("importFileId");
CREATE INDEX "TrainingSignal_merchantKey_idx" ON "TrainingSignal"("merchantKey");

-- AddForeignKey
ALTER TABLE "StatementTemplate" ADD CONSTRAINT "StatementTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingSignal" ADD CONSTRAINT "TrainingSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingSignal" ADD CONSTRAINT "TrainingSignal_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingSignal" ADD CONSTRAINT "TrainingSignal_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingSignal" ADD CONSTRAINT "TrainingSignal_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
