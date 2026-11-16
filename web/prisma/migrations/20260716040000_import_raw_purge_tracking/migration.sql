ALTER TABLE "ImportFile" ADD COLUMN IF NOT EXISTS "rawPurgedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ImportFile_rawPurgedAt_idx" ON "ImportFile"("rawPurgedAt");
