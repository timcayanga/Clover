-- CreateTable
CREATE TABLE "AccountRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "institution" TEXT,
    "accountType" "AccountType" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "timesConfirmed" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountRule_workspaceId_ruleKey_key" ON "AccountRule"("workspaceId", "ruleKey");
CREATE INDEX "AccountRule_workspaceId_idx" ON "AccountRule"("workspaceId");
CREATE INDEX "AccountRule_accountId_idx" ON "AccountRule"("accountId");
CREATE INDEX "AccountRule_ruleKey_idx" ON "AccountRule"("ruleKey");

-- AddForeignKey
ALTER TABLE "AccountRule" ADD CONSTRAINT "AccountRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountRule" ADD CONSTRAINT "AccountRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
