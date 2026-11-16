-- CreateEnum
CREATE TYPE "StatementCheckpointStatus" AS ENUM ('pending', 'reconciled', 'mismatch');

-- CreateTable
CREATE TABLE "AccountStatementCheckpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "importFileId" TEXT,
    "statementStartDate" TIMESTAMP(3),
    "statementEndDate" TIMESTAMP(3),
    "openingBalance" DECIMAL(18,2),
    "endingBalance" DECIMAL(18,2),
    "status" "StatementCheckpointStatus" NOT NULL DEFAULT 'pending',
    "mismatchReason" TEXT,
    "sourceMetadata" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountStatementCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountStatementCheckpoint_importFileId_key" ON "AccountStatementCheckpoint"("importFileId");
CREATE INDEX "AccountStatementCheckpoint_workspaceId_idx" ON "AccountStatementCheckpoint"("workspaceId");
CREATE INDEX "AccountStatementCheckpoint_accountId_idx" ON "AccountStatementCheckpoint"("accountId");
CREATE INDEX "AccountStatementCheckpoint_importFileId_idx" ON "AccountStatementCheckpoint"("importFileId");
CREATE INDEX "AccountStatementCheckpoint_statementStartDate_idx" ON "AccountStatementCheckpoint"("statementStartDate");
CREATE INDEX "AccountStatementCheckpoint_statementEndDate_idx" ON "AccountStatementCheckpoint"("statementEndDate");
CREATE INDEX "AccountStatementCheckpoint_status_idx" ON "AccountStatementCheckpoint"("status");

-- AddForeignKey
ALTER TABLE "AccountStatementCheckpoint" ADD CONSTRAINT "AccountStatementCheckpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountStatementCheckpoint" ADD CONSTRAINT "AccountStatementCheckpoint_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountStatementCheckpoint" ADD CONSTRAINT "AccountStatementCheckpoint_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
