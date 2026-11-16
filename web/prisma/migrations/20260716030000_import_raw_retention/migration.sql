ALTER TABLE "ImportFile" ADD COLUMN IF NOT EXISTS "rawExpiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ImportFile_rawExpiresAt_idx" ON "ImportFile"("rawExpiresAt");
