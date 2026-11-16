ALTER TABLE "SplitBillPaymentProfile" ADD COLUMN "personName" TEXT;
CREATE INDEX "SplitBillPaymentProfile_userId_personName_idx" ON "SplitBillPaymentProfile"("userId", "personName");
