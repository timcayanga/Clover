-- Earlier users have unknown login history. Only newly provisioned identities opt in.
ALTER TABLE "User"
  ADD COLUMN "firstLoginAt" TIMESTAMP(3),
  ADD COLUMN "firstLoginAnalyticsPending" BOOLEAN NOT NULL DEFAULT false;
