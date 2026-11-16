-- Persist non-statement financial documents before they are confirmed.
-- These models were present in schema.prisma but were never introduced by a
-- migration, which made receipt, portfolio, and account-detail confirmation
-- silently skip their durable extraction records.

CREATE TABLE IF NOT EXISTS "DocumentImport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importFileId" TEXT,
    "accountId" TEXT,
    "documentFamily" TEXT NOT NULL,
    "documentSubtype" TEXT,
    "institution" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "sourceMetadata" JSONB,
    "rawPayload" JSONB,
    "extractedPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentImportPage" (
    "id" TEXT NOT NULL,
    "documentImportId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "imageName" TEXT,
    "pageType" TEXT,
    "visibleTitle" TEXT,
    "visibleDate" TEXT,
    "visibleCurrency" TEXT,
    "rawOcrText" TEXT,
    "layoutNotes" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentImportPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReceiptDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentImportId" TEXT,
    "accountId" TEXT,
    "transactionId" TEXT,
    "merchantRaw" TEXT,
    "merchantClean" TEXT,
    "transactionDate" TIMESTAMP(3),
    "transactionTime" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "subtotal" DECIMAL(18,2),
    "tax" DECIMAL(18,2),
    "total" DECIMAL(18,2),
    "paymentMethod" TEXT,
    "accountMatch" JSONB,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReceiptDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvestmentSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentImportId" TEXT,
    "accountId" TEXT,
    "snapshotDate" TIMESTAMP(3),
    "portfolioName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "totalValue" DECIMAL(18,2),
    "costBasis" DECIMAL(18,2),
    "gainLossValue" DECIMAL(18,2),
    "gainLossPercent" DECIMAL(18,8),
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvestmentHolding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "investmentSnapshotId" TEXT NOT NULL,
    "documentImportId" TEXT,
    "accountId" TEXT,
    "rowIndex" INTEGER,
    "assetName" TEXT NOT NULL,
    "assetSymbol" TEXT,
    "assetType" TEXT,
    "quantity" DECIMAL(18,8),
    "unitPrice" DECIMAL(18,8),
    "costBasis" DECIMAL(18,2),
    "marketValue" DECIMAL(18,2),
    "currentValue" DECIMAL(18,2),
    "gainLossValue" DECIMAL(18,2),
    "gainLossPercent" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentHolding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringPattern" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentImportId" TEXT,
    "accountId" TEXT,
    "merchantRaw" TEXT NOT NULL,
    "merchantClean" TEXT,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "frequency" "CommitmentRecurrence",
    "firstSeenDate" TIMESTAMP(3),
    "lastSeenDate" TIMESTAMP(3),
    "nextExpectedDate" TIMESTAMP(3),
    "transactionCount" INTEGER NOT NULL DEFAULT 1,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentImport_importFileId_key" ON "DocumentImport"("importFileId");
CREATE INDEX IF NOT EXISTS "DocumentImport_workspaceId_idx" ON "DocumentImport"("workspaceId");
CREATE INDEX IF NOT EXISTS "DocumentImport_accountId_idx" ON "DocumentImport"("accountId");
CREATE INDEX IF NOT EXISTS "DocumentImport_documentFamily_idx" ON "DocumentImport"("documentFamily");
CREATE INDEX IF NOT EXISTS "DocumentImport_importFileId_idx" ON "DocumentImport"("importFileId");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentImportPage_documentImportId_pageNumber_key" ON "DocumentImportPage"("documentImportId", "pageNumber");
CREATE INDEX IF NOT EXISTS "DocumentImportPage_documentImportId_idx" ON "DocumentImportPage"("documentImportId");
CREATE INDEX IF NOT EXISTS "DocumentImportPage_pageType_idx" ON "DocumentImportPage"("pageType");
CREATE UNIQUE INDEX IF NOT EXISTS "ReceiptDocument_documentImportId_key" ON "ReceiptDocument"("documentImportId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReceiptDocument_transactionId_key" ON "ReceiptDocument"("transactionId");
CREATE INDEX IF NOT EXISTS "ReceiptDocument_workspaceId_idx" ON "ReceiptDocument"("workspaceId");
CREATE INDEX IF NOT EXISTS "ReceiptDocument_accountId_idx" ON "ReceiptDocument"("accountId");
CREATE INDEX IF NOT EXISTS "ReceiptDocument_transactionId_idx" ON "ReceiptDocument"("transactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "InvestmentSnapshot_documentImportId_key" ON "InvestmentSnapshot"("documentImportId");
CREATE INDEX IF NOT EXISTS "InvestmentSnapshot_workspaceId_idx" ON "InvestmentSnapshot"("workspaceId");
CREATE INDEX IF NOT EXISTS "InvestmentSnapshot_accountId_idx" ON "InvestmentSnapshot"("accountId");
CREATE INDEX IF NOT EXISTS "InvestmentSnapshot_snapshotDate_idx" ON "InvestmentSnapshot"("snapshotDate");
CREATE INDEX IF NOT EXISTS "InvestmentHolding_workspaceId_idx" ON "InvestmentHolding"("workspaceId");
CREATE INDEX IF NOT EXISTS "InvestmentHolding_investmentSnapshotId_idx" ON "InvestmentHolding"("investmentSnapshotId");
CREATE INDEX IF NOT EXISTS "InvestmentHolding_documentImportId_idx" ON "InvestmentHolding"("documentImportId");
CREATE INDEX IF NOT EXISTS "InvestmentHolding_accountId_idx" ON "InvestmentHolding"("accountId");
CREATE INDEX IF NOT EXISTS "InvestmentHolding_assetSymbol_idx" ON "InvestmentHolding"("assetSymbol");
CREATE INDEX IF NOT EXISTS "RecurringPattern_workspaceId_idx" ON "RecurringPattern"("workspaceId");
CREATE INDEX IF NOT EXISTS "RecurringPattern_accountId_idx" ON "RecurringPattern"("accountId");
CREATE INDEX IF NOT EXISTS "RecurringPattern_documentImportId_idx" ON "RecurringPattern"("documentImportId");
CREATE INDEX IF NOT EXISTS "RecurringPattern_nextExpectedDate_idx" ON "RecurringPattern"("nextExpectedDate");
CREATE INDEX IF NOT EXISTS "RecurringPattern_frequency_idx" ON "RecurringPattern"("frequency");

DO $$ BEGIN
    ALTER TABLE "DocumentImport" ADD CONSTRAINT "DocumentImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "DocumentImport" ADD CONSTRAINT "DocumentImport_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "DocumentImport" ADD CONSTRAINT "DocumentImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "DocumentImportPage" ADD CONSTRAINT "DocumentImportPage_documentImportId_fkey" FOREIGN KEY ("documentImportId") REFERENCES "DocumentImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ReceiptDocument" ADD CONSTRAINT "ReceiptDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ReceiptDocument" ADD CONSTRAINT "ReceiptDocument_documentImportId_fkey" FOREIGN KEY ("documentImportId") REFERENCES "DocumentImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ReceiptDocument" ADD CONSTRAINT "ReceiptDocument_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ReceiptDocument" ADD CONSTRAINT "ReceiptDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentSnapshot" ADD CONSTRAINT "InvestmentSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentSnapshot" ADD CONSTRAINT "InvestmentSnapshot_documentImportId_fkey" FOREIGN KEY ("documentImportId") REFERENCES "DocumentImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentSnapshot" ADD CONSTRAINT "InvestmentSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentHolding" ADD CONSTRAINT "InvestmentHolding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentHolding" ADD CONSTRAINT "InvestmentHolding_investmentSnapshotId_fkey" FOREIGN KEY ("investmentSnapshotId") REFERENCES "InvestmentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentHolding" ADD CONSTRAINT "InvestmentHolding_documentImportId_fkey" FOREIGN KEY ("documentImportId") REFERENCES "DocumentImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InvestmentHolding" ADD CONSTRAINT "InvestmentHolding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "RecurringPattern" ADD CONSTRAINT "RecurringPattern_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "RecurringPattern" ADD CONSTRAINT "RecurringPattern_documentImportId_fkey" FOREIGN KEY ("documentImportId") REFERENCES "DocumentImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "RecurringPattern" ADD CONSTRAINT "RecurringPattern_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
