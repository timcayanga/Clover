ALTER TABLE "ImportFile" ADD COLUMN IF NOT EXISTS "traceId" TEXT;
CREATE INDEX IF NOT EXISTS "ImportFile_traceId_idx" ON "ImportFile"("traceId");
ALTER TABLE "DataQaRun" ADD COLUMN IF NOT EXISTS "traceId" TEXT;
CREATE INDEX IF NOT EXISTS "DataQaRun_traceId_idx" ON "DataQaRun"("traceId");
