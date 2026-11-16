-- Additive only: existing signals, labels, rules, templates and financial data stay intact.
ALTER TABLE "MerchantRule" ADD COLUMN "learningObservedAt" TIMESTAMP(3);
ALTER TABLE "AccountRule" ADD COLUMN "learningObservedAt" TIMESTAMP(3);
ALTER TABLE "StatementTemplate" ADD COLUMN "learningObservedAt" TIMESTAMP(3);
ALTER TABLE "TrainingSignal" ADD COLUMN "appliedObservationKey" TEXT, ADD COLUMN "learningObservedAt" TIMESTAMP(3);
CREATE TABLE "LearningJob" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "dedupeKey" TEXT NOT NULL,
  "source" TEXT NOT NULL, "sourceId" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "totalItems" INTEGER NOT NULL,
  "nextIndex" INTEGER NOT NULL DEFAULT 0, "appliedItems" INTEGER NOT NULL DEFAULT 0,
  "skippedItems" INTEGER NOT NULL DEFAULT 0, "attempts" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0, "errorCode" TEXT, "errorMessage" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseToken" TEXT,
  "lockedUntil" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningJob_workspaceId_dedupeKey_key" ON "LearningJob"("workspaceId", "dedupeKey");
CREATE INDEX "LearningJob_status_nextAttemptAt_idx" ON "LearningJob"("status", "nextAttemptAt");
CREATE INDEX "LearningJob_workspaceId_createdAt_idx" ON "LearningJob"("workspaceId", "createdAt");
CREATE TABLE "LearningJobAttempt" (
  "id" TEXT PRIMARY KEY, "jobId" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL, "startIndex" INTEGER NOT NULL, "endIndex" INTEGER NOT NULL,
  "errorCode" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "LearningJobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "LearningJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningJobAttempt_jobId_attempt_key" ON "LearningJobAttempt"("jobId", "attempt");
-- Exact, Profile-scoped retrieval remains efficient as knowledge grows.
CREATE INDEX "TrainingSignal_workspaceId_merchantKey_approvalStatus_idx" ON "TrainingSignal"("workspaceId", "merchantKey", "approvalStatus");
-- Learning payloads are private server-side data, never Supabase Data API objects.
ALTER TABLE "LearningJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningJobAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "LearningJob", "LearningJobAttempt" FROM PUBLIC, anon, authenticated, service_role;
