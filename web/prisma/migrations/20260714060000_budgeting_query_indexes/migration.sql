CREATE INDEX "Transaction_workspaceId_date_idx" ON "Transaction"("workspaceId", "date");

CREATE INDEX "FinancialCommitment_workspaceId_status_kind_idx" ON "FinancialCommitment"("workspaceId", "status", "kind");
