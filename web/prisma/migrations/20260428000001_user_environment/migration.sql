ALTER TABLE "User"
ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';

UPDATE "User"
SET "environment" = 'staging'
WHERE "clerkUserId" = 'staging-guest';

CREATE INDEX "User_environment_idx" ON "User"("environment");
