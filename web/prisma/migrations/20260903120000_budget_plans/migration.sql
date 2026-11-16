-- Existing limits remain unassigned and are displayed in Personal budget.
-- No transaction values or budget calculations are modified.
CREATE TABLE "BudgetPlan" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BudgetPlan_workspaceId_idx" ON "BudgetPlan"("workspaceId");
ALTER TABLE "Budget" ADD COLUMN "planId" TEXT;
CREATE INDEX "Budget_planId_idx" ON "Budget"("planId");
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BudgetPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetPlan" ENABLE ROW LEVEL SECURITY;
