-- Add a flexible goal plan payload so Clover can track cadence, purpose, and percent-based goals.
ALTER TABLE "User"
ADD COLUMN "goalPlan" JSONB;

ALTER TABLE "GoalSetting"
ADD COLUMN "goalPlan" JSONB;
