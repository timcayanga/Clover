CREATE TABLE "AdminApproval" (
  "id" TEXT PRIMARY KEY,
  "requesterId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "targetUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "preview" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','approved','rejected','executing','completed','failed')),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminApproval_different_owner" CHECK ("reviewerId" IS NULL OR "reviewerId" <> "requesterId")
);
CREATE INDEX "AdminApproval_status_createdAt_idx" ON "AdminApproval"("status", "createdAt");
CREATE INDEX "AdminApproval_targetUserId_createdAt_idx" ON "AdminApproval"("targetUserId", "createdAt");
ALTER TABLE "AdminApproval" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "AdminApproval" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "AdminApproval" FROM authenticated; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON "AdminApproval" FROM service_role; END IF;
END $$;
