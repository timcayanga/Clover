CREATE TABLE "FinancialCommitmentOccurrence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialCommitmentOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialCommitmentOccurrence_commitmentId_dueDate_key"
ON "FinancialCommitmentOccurrence"("commitmentId", "dueDate");

CREATE INDEX "FinancialCommitmentOccurrence_workspaceId_dueDate_idx"
ON "FinancialCommitmentOccurrence"("workspaceId", "dueDate");

CREATE INDEX "FinancialCommitmentOccurrence_commitmentId_idx"
ON "FinancialCommitmentOccurrence"("commitmentId");

ALTER TABLE "FinancialCommitmentOccurrence"
ADD CONSTRAINT "FinancialCommitmentOccurrence_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialCommitmentOccurrence"
ADD CONSTRAINT "FinancialCommitmentOccurrence_commitmentId_fkey"
FOREIGN KEY ("commitmentId") REFERENCES "FinancialCommitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialCommitmentOccurrence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FinancialCommitmentOccurrence" FROM anon, authenticated;
