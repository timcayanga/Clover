ALTER TABLE "FinverseAccountLink" ADD COLUMN "unlinkedAt" TIMESTAMP(3);
CREATE TABLE "BankLinkUsage" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "externalAccountId" TEXT NOT NULL,
 "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "BankLinkUsage_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BankLinkUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankLinkUsage_userId_periodStart_externalAccountId_key" ON "BankLinkUsage"("userId", "periodStart", "externalAccountId");
CREATE INDEX "BankLinkUsage_userId_periodEnd_idx" ON "BankLinkUsage"("userId", "periodEnd");
