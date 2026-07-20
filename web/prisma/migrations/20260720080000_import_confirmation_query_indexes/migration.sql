-- Keep statement confirmation and duplicate detection on indexed paths as a
-- workspace accumulates transaction history. These indexes match the import
-- pipeline's read predicates and do not alter financial records.
CREATE INDEX "ImportFile_workspaceId_sourceFingerprint_status_idx"
  ON "ImportFile"("workspaceId", "sourceFingerprint", "status");

CREATE INDEX "Transaction_accountId_deletedAt_idx"
  ON "Transaction"("accountId", "deletedAt");

CREATE INDEX "Transaction_workspaceId_deletedAt_accountId_idx"
  ON "Transaction"("workspaceId", "deletedAt", "accountId");
