CREATE TABLE IF NOT EXISTS "ImportFileExtractionCache" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "fileFingerprint" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "importMode" TEXT NOT NULL,
  "cacheVersion" TEXT NOT NULL,
  "extractedText" TEXT NOT NULL,
  "statementFingerprint" TEXT,
  "statementFamilySignature" TEXT,
  "metadata" JSONB,
  "parsedRows" JSONB,
  "pageCount" INTEGER NOT NULL DEFAULT 0,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImportFileExtractionCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportFileExtractionCache_workspace_fingerprint_mode_cache_key"
  ON "ImportFileExtractionCache"("workspaceId", "fileFingerprint", "fileType", "importMode", "cacheVersion");

CREATE INDEX IF NOT EXISTS "ImportFileExtractionCache_workspaceId_idx"
  ON "ImportFileExtractionCache"("workspaceId");

CREATE INDEX IF NOT EXISTS "ImportFileExtractionCache_fileFingerprint_idx"
  ON "ImportFileExtractionCache"("fileFingerprint");

CREATE INDEX IF NOT EXISTS "ImportFileExtractionCache_statementFingerprint_idx"
  ON "ImportFileExtractionCache"("statementFingerprint");

CREATE INDEX IF NOT EXISTS "ImportFileExtractionCache_cacheVersion_idx"
  ON "ImportFileExtractionCache"("cacheVersion");

ALTER TABLE "ImportFileExtractionCache"
  ADD CONSTRAINT "ImportFileExtractionCache_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
