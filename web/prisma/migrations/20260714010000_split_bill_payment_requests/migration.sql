CREATE TYPE "SplitBillPaymentRequestStatus" AS ENUM ('requested', 'payment_reported', 'paid', 'declined');

ALTER TABLE "SplitBillGroup" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "SplitBillPaymentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "accountName" TEXT,
    "accountNumber" TEXT,
    "qrPayload" TEXT,
    "qrImageData" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillPaymentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SplitBillPaymentRequest" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "paymentProfileId" TEXT,
    "recipientParticipantId" TEXT NOT NULL,
    "payeeParticipantId" TEXT NOT NULL DEFAULT '',
    "recipientName" TEXT NOT NULL,
    "payeeName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "dueDate" TIMESTAMP(3),
    "status" "SplitBillPaymentRequestStatus" NOT NULL DEFAULT 'requested',
    "shareToken" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paymentReportedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "SplitBillPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SplitBillPaymentRequest_shareToken_key" ON "SplitBillPaymentRequest"("shareToken");
CREATE INDEX "SplitBillPaymentProfile_userId_idx" ON "SplitBillPaymentProfile"("userId");
CREATE INDEX "SplitBillPaymentProfile_userId_currency_idx" ON "SplitBillPaymentProfile"("userId", "currency");
CREATE INDEX "SplitBillPaymentRequest_billId_idx" ON "SplitBillPaymentRequest"("billId");
CREATE INDEX "SplitBillPaymentRequest_recipientParticipantId_idx" ON "SplitBillPaymentRequest"("recipientParticipantId");
CREATE INDEX "SplitBillPaymentRequest_status_idx" ON "SplitBillPaymentRequest"("status");
CREATE INDEX "SplitBillPaymentRequest_dueDate_idx" ON "SplitBillPaymentRequest"("dueDate");

ALTER TABLE "SplitBillPaymentProfile"
ADD CONSTRAINT "SplitBillPaymentProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SplitBillPaymentRequest"
ADD CONSTRAINT "SplitBillPaymentRequest_billId_fkey"
FOREIGN KEY ("billId") REFERENCES "SplitBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SplitBillPaymentRequest"
ADD CONSTRAINT "SplitBillPaymentRequest_paymentProfileId_fkey"
FOREIGN KEY ("paymentProfileId") REFERENCES "SplitBillPaymentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
