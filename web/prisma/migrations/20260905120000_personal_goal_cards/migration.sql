-- Additional goals are separate from the existing user focus and its history.
CREATE TABLE "PersonalGoal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "goalKey" TEXT NOT NULL,
  "targetAmount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "goalPlan" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PersonalGoal_workspaceId_createdAt_idx" ON "PersonalGoal"("workspaceId", "createdAt");
ALTER TABLE "PersonalGoal" ADD CONSTRAINT "PersonalGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonalGoal" ENABLE ROW LEVEL SECURITY;
