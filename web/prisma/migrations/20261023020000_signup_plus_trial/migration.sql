ALTER TABLE "User" ADD COLUMN "signupTrialEvaluatedAt" TIMESTAMP(3);
CREATE TABLE "SignupTrialPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "SignupTrialPolicy" ("id") VALUES ('signup-plus-v1');
CREATE TABLE "SignupTrial" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "expiryProcessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignupTrial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SignupTrial_dates_check" CHECK ("endsAt" = "startsAt" + INTERVAL '30 days')
);
CREATE UNIQUE INDEX "SignupTrial_userId_key" ON "SignupTrial"("userId");
CREATE INDEX "SignupTrial_expiryProcessedAt_endsAt_idx" ON "SignupTrial"("expiryProcessedAt", "endsAt");
ALTER TABLE "NotificationEmailDelivery" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "retryAt" TIMESTAMP(3), ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "outcome" TEXT;
-- Trusted server only: Clerk-authenticated APIs own all access to these records.
ALTER TABLE "SignupTrialPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignupTrial" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SignupTrialPolicy", "SignupTrial" FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON "SignupTrialPolicy", "SignupTrial" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
