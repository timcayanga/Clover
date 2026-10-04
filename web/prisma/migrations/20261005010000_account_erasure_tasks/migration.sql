CREATE TABLE "AccountErasureTask" (
 "id" TEXT PRIMARY KEY,
 "clerkUserId" TEXT NOT NULL,
 "environment" TEXT NOT NULL,
 "provider" TEXT NOT NULL,
 "payload" JSONB NOT NULL DEFAULT '{}',
 "status" TEXT NOT NULL DEFAULT 'pending',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "lastError" TEXT,
 "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("clerkUserId", "provider")
);
CREATE INDEX "AccountErasureTask_environment_status_retryAt_idx" ON "AccountErasureTask"("environment", "status", "retryAt");
