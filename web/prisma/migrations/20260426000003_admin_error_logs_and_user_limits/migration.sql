ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountLimit" INTEGER,
  ADD COLUMN IF NOT EXISTS "monthlyUploadLimit" INTEGER,
  ADD COLUMN IF NOT EXISTS "transactionLimit" INTEGER;

CREATE TABLE IF NOT EXISTS "AppErrorLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "name" TEXT,
    "stack" TEXT,
    "source" TEXT NOT NULL,
    "route" TEXT,
    "url" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "buildId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "environment" TEXT NOT NULL,
    "userAgent" TEXT,
    "clerkUserId" TEXT,
    "userId" TEXT,
    "workspaceId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppErrorLog_occurredAt_idx" ON "AppErrorLog"("occurredAt");
CREATE INDEX IF NOT EXISTS "AppErrorLog_buildId_idx" ON "AppErrorLog"("buildId");
CREATE INDEX IF NOT EXISTS "AppErrorLog_environment_idx" ON "AppErrorLog"("environment");
CREATE INDEX IF NOT EXISTS "AppErrorLog_source_idx" ON "AppErrorLog"("source");
CREATE INDEX IF NOT EXISTS "AppErrorLog_userId_idx" ON "AppErrorLog"("userId");

ALTER TABLE "AppErrorLog"
  ADD CONSTRAINT "AppErrorLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
