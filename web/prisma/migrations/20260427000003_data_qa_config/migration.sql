CREATE TABLE IF NOT EXISTS "DataQaConfig" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataQaConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataQaConfig_key_key" ON "DataQaConfig"("key");
CREATE INDEX IF NOT EXISTS "DataQaConfig_key_idx" ON "DataQaConfig"("key");
