ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reviewPriority" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reviewReasons" JSONB;
CREATE INDEX IF NOT EXISTS "Transaction_workspaceId_reviewPriority_reviewStatus_idx"
  ON "Transaction"("workspaceId", "reviewPriority", "reviewStatus");
