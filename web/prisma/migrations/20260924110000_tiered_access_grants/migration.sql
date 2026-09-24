ALTER TABLE "ProAccessGrant" ADD COLUMN "planTier" "PlanTier" NOT NULL DEFAULT 'pro';
ALTER TABLE "ProAccessGrant" ADD CONSTRAINT "ProAccessGrant_paid_tier_check" CHECK ("planTier" IN ('pro', 'premium'));
