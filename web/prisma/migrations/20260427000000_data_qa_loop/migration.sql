CREATE TABLE "DataQaRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importFileId" TEXT,
    "source" TEXT NOT NULL,
    "stage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "parserVersion" TEXT,
    "parserDurationMs" INTEGER,
    "totalDurationMs" INTEGER,
    "score" INTEGER NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataQaRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataQaFinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dataQaRunId" TEXT NOT NULL,
    "importFileId" TEXT,
    "transactionId" TEXT,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "observedValue" JSONB,
    "expectedValue" JSONB,
    "suggestion" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQaFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataQaRun_workspaceId_idx" ON "DataQaRun"("workspaceId");
CREATE INDEX "DataQaRun_importFileId_idx" ON "DataQaRun"("importFileId");
CREATE INDEX "DataQaRun_source_idx" ON "DataQaRun"("source");
CREATE INDEX "DataQaRun_status_idx" ON "DataQaRun"("status");

CREATE INDEX "DataQaFinding_workspaceId_idx" ON "DataQaFinding"("workspaceId");
CREATE INDEX "DataQaFinding_dataQaRunId_idx" ON "DataQaFinding"("dataQaRunId");
CREATE INDEX "DataQaFinding_importFileId_idx" ON "DataQaFinding"("importFileId");
CREATE INDEX "DataQaFinding_transactionId_idx" ON "DataQaFinding"("transactionId");
CREATE INDEX "DataQaFinding_code_idx" ON "DataQaFinding"("code");
CREATE INDEX "DataQaFinding_severity_idx" ON "DataQaFinding"("severity");

ALTER TABLE "DataQaRun" ADD CONSTRAINT "DataQaRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataQaRun" ADD CONSTRAINT "DataQaRun_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataQaFinding" ADD CONSTRAINT "DataQaFinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataQaFinding" ADD CONSTRAINT "DataQaFinding_dataQaRunId_fkey" FOREIGN KEY ("dataQaRunId") REFERENCES "DataQaRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataQaFinding" ADD CONSTRAINT "DataQaFinding_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataQaFinding" ADD CONSTRAINT "DataQaFinding_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
