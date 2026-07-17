CREATE TABLE IF NOT EXISTS "AdminSupportAction" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT,
  "targetClerkUserId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSupportAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdminSupportAction_targetUserId_idx" ON "AdminSupportAction"("targetUserId");
CREATE INDEX IF NOT EXISTS "AdminSupportAction_targetClerkUserId_idx" ON "AdminSupportAction"("targetClerkUserId");
CREATE INDEX IF NOT EXISTS "AdminSupportAction_actorUserId_idx" ON "AdminSupportAction"("actorUserId");
CREATE INDEX IF NOT EXISTS "AdminSupportAction_action_idx" ON "AdminSupportAction"("action");
CREATE INDEX IF NOT EXISTS "AdminSupportAction_createdAt_idx" ON "AdminSupportAction"("createdAt");
DO $$ BEGIN
  ALTER TABLE "AdminSupportAction" ADD CONSTRAINT "AdminSupportAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AdminSupportNote" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminSupportNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdminSupportNote_targetUserId_createdAt_idx" ON "AdminSupportNote"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminSupportNote_actorUserId_idx" ON "AdminSupportNote"("actorUserId");
DO $$ BEGIN
  ALTER TABLE "AdminSupportNote" ADD CONSTRAINT "AdminSupportNote_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AdminDataSnapshot" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT,
  "targetClerkUserId" TEXT NOT NULL,
  "snapshotType" TEXT NOT NULL DEFAULT 'pre_wipe',
  "payload" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredAt" TIMESTAMP(3),
  "restoredBy" TEXT,
  CONSTRAINT "AdminDataSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdminDataSnapshot_targetUserId_createdAt_idx" ON "AdminDataSnapshot"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminDataSnapshot_targetClerkUserId_createdAt_idx" ON "AdminDataSnapshot"("targetClerkUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminDataSnapshot_snapshotType_idx" ON "AdminDataSnapshot"("snapshotType");
DO $$ BEGIN
  ALTER TABLE "AdminDataSnapshot" ADD CONSTRAINT "AdminDataSnapshot_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
