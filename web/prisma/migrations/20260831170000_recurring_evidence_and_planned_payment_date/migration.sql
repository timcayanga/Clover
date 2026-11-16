ALTER TABLE "FinancialCommitment"
ADD COLUMN "plannedPaymentDate" TIMESTAMP(3),
ADD COLUMN "evidenceTransactionIds" JSONB;

CREATE INDEX "FinancialCommitment_plannedPaymentDate_idx"
ON "FinancialCommitment"("plannedPaymentDate");
