CREATE TABLE "AdminMember" (
  "clerkUserId" TEXT PRIMARY KEY,
  "role" TEXT NOT NULL CHECK ("role" IN ('owner', 'admin', 'support', 'read_only')),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AdminPermissionAudit" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminPermissionAudit_targetId_createdAt_idx" ON "AdminPermissionAudit"("targetId", "createdAt");
ALTER TABLE "AdminMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminPermissionAudit" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AdminMember", "AdminPermissionAudit" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AdminMember", "AdminPermissionAudit" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON "AdminMember", "AdminPermissionAudit" FROM service_role;
  END IF;
END $$;
