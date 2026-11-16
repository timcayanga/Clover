-- Additive collaboration metadata only; no financial backfill or relabelling.
ALTER TABLE "CircleBudget" ADD COLUMN "oneTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CircleCommitment" ADD COLUMN "assignedMemberIds" JSONB;
ALTER TABLE "CircleSharedTransaction" ADD COLUMN "splitConfig" JSONB;
