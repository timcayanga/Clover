CREATE INDEX "CircleInvitation_invitedByUserId_idx"
ON "CircleInvitation"("invitedByUserId");

CREATE INDEX "CircleSharedTransaction_transactionId_idx"
ON "CircleSharedTransaction"("transactionId");

CREATE INDEX "CircleInvestmentShare_accountId_idx"
ON "CircleInvestmentShare"("accountId");

CREATE INDEX "SplitBillPaymentRequest_paymentProfileId_idx"
ON "SplitBillPaymentRequest"("paymentProfileId");

CREATE INDEX "MerchantRule_categoryId_idx"
ON "MerchantRule"("categoryId");

CREATE INDEX "TrainingSignal_categoryId_idx"
ON "TrainingSignal"("categoryId");
