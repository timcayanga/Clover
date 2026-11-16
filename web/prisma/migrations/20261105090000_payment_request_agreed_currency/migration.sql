ALTER TABLE "SplitBillPaymentRequest" ADD COLUMN "billAmount" DECIMAL(18,2), ADD COLUMN "billCurrency" TEXT;
ALTER TABLE "CircleContribution" ADD COLUMN "destinationLabel" TEXT;
