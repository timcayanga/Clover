CREATE TABLE IF NOT EXISTS "AccountTombstone" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT,
  "name" TEXT,
  "institution" TEXT,
  "accountNumber" TEXT,
  "normalizedAccountKey" TEXT NOT NULL,
  "accountType" "AccountType" NOT NULL DEFAULT 'bank',
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "source" TEXT,
  "reason" TEXT NOT NULL DEFAULT 'account_deleted',
  "rawPayload" JSONB,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountTombstone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountTombstone_workspaceId_idx" ON "AccountTombstone"("workspaceId");
CREATE INDEX IF NOT EXISTS "AccountTombstone_accountId_idx" ON "AccountTombstone"("accountId");
CREATE INDEX IF NOT EXISTS "AccountTombstone_normalizedAccountKey_idx" ON "AccountTombstone"("normalizedAccountKey");
CREATE INDEX IF NOT EXISTS "AccountTombstone_deletedAt_idx" ON "AccountTombstone"("deletedAt");

ALTER TABLE "AccountTombstone" ADD CONSTRAINT "AccountTombstone_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
