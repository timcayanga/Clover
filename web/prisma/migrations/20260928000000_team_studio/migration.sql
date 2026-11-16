CREATE TABLE "TeamStudioState" (
  "ownerId" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "TeamStudioAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TeamStudioAudit_ownerId_revision_key" ON "TeamStudioAudit"("ownerId", "revision");
CREATE TABLE "TeamStudioMedia" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "stagingKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TeamStudioMedia_storageKey_key" ON "TeamStudioMedia"("storageKey");
CREATE UNIQUE INDEX "TeamStudioMedia_stagingKey_key" ON "TeamStudioMedia"("stagingKey");
CREATE INDEX "TeamStudioMedia_ownerId_createdAt_idx" ON "TeamStudioMedia"("ownerId", "createdAt");
ALTER TABLE "TeamStudioState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamStudioAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamStudioMedia" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TeamStudioState", "TeamStudioAudit", "TeamStudioMedia" FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON "TeamStudioState", "TeamStudioAudit", "TeamStudioMedia" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
