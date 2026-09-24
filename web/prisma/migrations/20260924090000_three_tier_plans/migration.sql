ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'premium';
ALTER TABLE "MobileLocalAllowance" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'requests';
