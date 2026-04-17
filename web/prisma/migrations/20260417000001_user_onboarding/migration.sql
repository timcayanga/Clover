-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PlanTier" AS ENUM ('free', 'pro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "planTier" "PlanTier" NOT NULL DEFAULT 'free',
ADD COLUMN IF NOT EXISTS "primaryGoal" TEXT,
ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
