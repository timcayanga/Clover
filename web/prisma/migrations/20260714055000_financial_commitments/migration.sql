DO $$
BEGIN
    CREATE TYPE "CommitmentKind" AS ENUM ('planned_payment', 'debt', 'receivable', 'reminder');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "CommitmentRecurrence" AS ENUM ('once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "CommitmentStatus" AS ENUM ('active', 'paused', 'resolved');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FinancialCommitment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "CommitmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "counterparty" TEXT,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "dueDate" TIMESTAMP(3),
    "recurrence" "CommitmentRecurrence" NOT NULL DEFAULT 'once',
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "accountId" TEXT,
    "transactionId" TEXT,
    "statementCheckpointId" TEXT,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCommitment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FinancialCommitment_workspaceId_idx" ON "FinancialCommitment"("workspaceId");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_kind_idx" ON "FinancialCommitment"("kind");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_status_idx" ON "FinancialCommitment"("status");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_dueDate_idx" ON "FinancialCommitment"("dueDate");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_nextDueDate_idx" ON "FinancialCommitment"("nextDueDate");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_accountId_idx" ON "FinancialCommitment"("accountId");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_transactionId_idx" ON "FinancialCommitment"("transactionId");
CREATE INDEX IF NOT EXISTS "FinancialCommitment_statementCheckpointId_idx" ON "FinancialCommitment"("statementCheckpointId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialCommitment_workspaceId_fkey') THEN
        ALTER TABLE "FinancialCommitment"
        ADD CONSTRAINT "FinancialCommitment_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialCommitment_accountId_fkey') THEN
        ALTER TABLE "FinancialCommitment"
        ADD CONSTRAINT "FinancialCommitment_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialCommitment_transactionId_fkey') THEN
        ALTER TABLE "FinancialCommitment"
        ADD CONSTRAINT "FinancialCommitment_transactionId_fkey"
        FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialCommitment_statementCheckpointId_fkey') THEN
        ALTER TABLE "FinancialCommitment"
        ADD CONSTRAINT "FinancialCommitment_statementCheckpointId_fkey"
        FOREIGN KEY ("statementCheckpointId") REFERENCES "AccountStatementCheckpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "FinancialCommitment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FinancialCommitment" FROM anon, authenticated;
