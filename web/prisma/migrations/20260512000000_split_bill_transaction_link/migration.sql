-- Link split bills to source transactions.
ALTER TABLE "SplitBill"
ADD COLUMN "transactionId" TEXT;

CREATE UNIQUE INDEX "SplitBill_transactionId_key" ON "SplitBill"("transactionId");
CREATE INDEX "SplitBill_transactionId_idx" ON "SplitBill"("transactionId");

ALTER TABLE "SplitBill"
ADD CONSTRAINT "SplitBill_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
