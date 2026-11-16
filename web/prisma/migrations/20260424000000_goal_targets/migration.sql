-- Add a persisted monthly goal amount plus a history table for changes over time.
ALTER TABLE "User"
ADD COLUMN "goalTargetAmount" DECIMAL(18,2),
ADD COLUMN "goalTargetSource" TEXT;

CREATE TABLE "GoalSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "primaryGoal" TEXT,
    "targetAmount" DECIMAL(18,2),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoalSetting_userId_idx" ON "GoalSetting"("userId");
CREATE INDEX "GoalSetting_userId_createdAt_idx" ON "GoalSetting"("userId", "createdAt");

ALTER TABLE "GoalSetting"
ADD CONSTRAINT "GoalSetting_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
