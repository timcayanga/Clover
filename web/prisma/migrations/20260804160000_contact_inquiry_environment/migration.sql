ALTER TABLE "ContactInquiry"
ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'production';

UPDATE "ContactInquiry"
SET "environment" = 'staging'
WHERE "sourcePage" ILIKE '%staging.clover.ph%';

CREATE INDEX IF NOT EXISTS "ContactInquiry_environment_createdAt_idx"
ON "ContactInquiry"("environment", "createdAt");
