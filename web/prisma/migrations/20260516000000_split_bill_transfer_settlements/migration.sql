CREATE TABLE "SplitBillTransferSettlement" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "fromParticipantId" TEXT NOT NULL,
    "fromParticipantName" TEXT NOT NULL,
    "toParticipantId" TEXT NOT NULL,
    "toParticipantName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillTransferSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SplitBillTransferSettlement_billId_idx" ON "SplitBillTransferSettlement"("billId");
CREATE INDEX "SplitBillTransferSettlement_fromParticipantId_idx" ON "SplitBillTransferSettlement"("fromParticipantId");
CREATE INDEX "SplitBillTransferSettlement_toParticipantId_idx" ON "SplitBillTransferSettlement"("toParticipantId");

ALTER TABLE "SplitBillTransferSettlement"
ADD CONSTRAINT "SplitBillTransferSettlement_billId_fkey"
FOREIGN KEY ("billId") REFERENCES "SplitBill"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
