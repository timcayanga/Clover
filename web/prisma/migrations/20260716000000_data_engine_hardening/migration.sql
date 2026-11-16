ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "sourceRowKey" TEXT;
CREATE INDEX IF NOT EXISTS "Transaction_importFileId_sourceRowKey_idx" ON "Transaction"("importFileId", "sourceRowKey");

ALTER TABLE "ImportFile" ADD COLUMN IF NOT EXISTS "sourceFingerprint" TEXT;
ALTER TABLE "ImportFile" ADD COLUMN IF NOT EXISTS "sourceTimezone" TEXT;
ALTER TABLE "ImportFile" ADD COLUMN IF NOT EXISTS "sourceLocale" TEXT;

ALTER TABLE "ImportEnrichmentJob" ADD COLUMN IF NOT EXISTS "leaseToken" TEXT;
ALTER TABLE "ImportEnrichmentJob" ADD COLUMN IF NOT EXISTS "leaseVersion" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_leaseToken_idx" ON "ImportEnrichmentJob"("leaseToken");
