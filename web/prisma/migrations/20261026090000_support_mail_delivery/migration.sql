ALTER TABLE "ContactInquiry"
  ADD COLUMN "notificationStatus" TEXT NOT NULL DEFAULT 'untracked',
  ADD COLUMN "notificationErrorCode" TEXT,
  ADD COLUMN "notificationMessageId" TEXT,
  ADD COLUMN "notificationAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "notificationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdminSupportMessage"
  ADD COLUMN "deliveryErrorCode" TEXT,
  ADD COLUMN "mailMessageId" TEXT;
-- Historical notifications remain untracked. Do not backfill them as pending:
-- absence of a delivery ledger is not proof that email was never accepted.
