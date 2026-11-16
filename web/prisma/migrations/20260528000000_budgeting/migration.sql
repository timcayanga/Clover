CREATE TYPE "BudgetScope" AS ENUM ('global', 'account', 'category');

CREATE TYPE "BudgetCadence" AS ENUM ('daily', 'weekly', 'monthly');

CREATE TYPE "BudgetKind" AS ENUM ('spend_limit', 'savings_target');

CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL DEFAULT 'spend_limit',
    "scope" "BudgetScope" NOT NULL DEFAULT 'global',
    "cadence" "BudgetCadence" NOT NULL DEFAULT 'monthly',
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Budget_workspaceId_idx" ON "Budget"("workspaceId");
CREATE INDEX "Budget_workspaceId_scope_cadence_isActive_idx" ON "Budget"("workspaceId", "scope", "cadence", "isActive");
CREATE INDEX "Budget_accountId_idx" ON "Budget"("accountId");
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");

ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
