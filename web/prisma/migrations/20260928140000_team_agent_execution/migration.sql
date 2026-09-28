CREATE TABLE "TeamAgentRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "ownerId" TEXT NOT NULL, "briefId" TEXT NOT NULL,
  "agent" TEXT NOT NULL, "parentId" TEXT, "triggerKey" TEXT NOT NULL, "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'starting', "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "prompt" JSONB NOT NULL, "responseId" TEXT, "result" TEXT NOT NULL DEFAULT '',
  "sources" JSONB NOT NULL DEFAULT '[]', "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0, "searchCalls" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION, "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3),
  "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TeamAgentRun_responseId_key" ON "TeamAgentRun"("responseId");
CREATE UNIQUE INDEX "TeamAgentRun_ownerId_triggerKey_key" ON "TeamAgentRun"("ownerId", "triggerKey");
CREATE INDEX "TeamAgentRun_ownerId_briefId_createdAt_idx" ON "TeamAgentRun"("ownerId", "briefId", "createdAt");
CREATE INDEX "TeamAgentRun_status_nextPollAt_idx" ON "TeamAgentRun"("status", "nextPollAt");
CREATE TABLE "TeamAgentEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "TeamAgentRun"("id") ON DELETE CASCADE,
  "action" TEXT NOT NULL, "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TeamAgentEvent_runId_createdAt_idx" ON "TeamAgentEvent"("runId", "createdAt");
ALTER TABLE "TeamAgentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamAgentEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TeamAgentRun", "TeamAgentEvent" FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON "TeamAgentRun", "TeamAgentEvent" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
