DO $$ BEGIN
  CREATE TYPE "ImportEnrichmentJobStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'retrying');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ImportEnrichmentJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "importFileId" TEXT NOT NULL,
  "status" "ImportEnrichmentJobStatus" NOT NULL DEFAULT 'queued',
  "phase" TEXT NOT NULL DEFAULT 'queued',
  "lastRowIndex" INTEGER NOT NULL DEFAULT 0,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportEnrichmentJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportEnrichmentJob_importFileId_key" ON "ImportEnrichmentJob"("importFileId");
CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_workspaceId_idx" ON "ImportEnrichmentJob"("workspaceId");
CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_status_idx" ON "ImportEnrichmentJob"("status");
CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_lockedAt_idx" ON "ImportEnrichmentJob"("lockedAt");
CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_updatedAt_idx" ON "ImportEnrichmentJob"("updatedAt");

DO $$ BEGIN
  ALTER TABLE "ImportEnrichmentJob"
    ADD CONSTRAINT "ImportEnrichmentJob_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ImportEnrichmentJob"
    ADD CONSTRAINT "ImportEnrichmentJob_importFileId_fkey"
    FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
