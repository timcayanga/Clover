-- Restore tables already referenced by the Prisma schema and starter Profile checks.
-- Additive only: no existing financial rows, columns or indexes are changed.
BEGIN;

-- CreateEnum
CREATE TYPE "BrankasStatementSessionStatus" AS ENUM ('initiated', 'pending', 'completed', 'failed', 'cancelled', 'purged', 'notified', 'received');

-- CreateTable
CREATE TABLE "BrankasStatementSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "externalId" TEXT NOT NULL,
    "statementId" TEXT,
    "requestId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PH',
    "bankCodes" JSONB NOT NULL,
    "status" "BrankasStatementSessionStatus" NOT NULL DEFAULT 'initiated',
    "redirectUri" TEXT,
    "appRedirectUri" TEXT NOT NULL,
    "appRedirectErrorUri" TEXT,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB,
    "lastNotificationStatus" TEXT,
    "lastNotificationPayload" JSONB,
    "lastNotificationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrankasStatementSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrankasStatementNotificationEvent" (
    "id" TEXT NOT NULL,
    "brankasSessionId" TEXT,
    "statementId" TEXT,
    "notificationId" TEXT,
    "statementStatus" TEXT,
    "url" TEXT,
    "payload" JSONB NOT NULL,
    "httpStatus" TEXT,
    "httpResponse" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrankasStatementNotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrankasStatementSession_externalId_key" ON "BrankasStatementSession"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BrankasStatementSession_statementId_key" ON "BrankasStatementSession"("statementId");

-- CreateIndex
CREATE INDEX "BrankasStatementSession_workspaceId_idx" ON "BrankasStatementSession"("workspaceId");

-- CreateIndex
CREATE INDEX "BrankasStatementSession_userId_idx" ON "BrankasStatementSession"("userId");

-- CreateIndex
CREATE INDEX "BrankasStatementSession_statementId_idx" ON "BrankasStatementSession"("statementId");

-- CreateIndex
CREATE INDEX "BrankasStatementSession_requestId_idx" ON "BrankasStatementSession"("requestId");

-- CreateIndex
CREATE INDEX "BrankasStatementSession_status_idx" ON "BrankasStatementSession"("status");

-- CreateIndex
CREATE INDEX "BrankasStatementNotificationEvent_brankasSessionId_idx" ON "BrankasStatementNotificationEvent"("brankasSessionId");

-- CreateIndex
CREATE INDEX "BrankasStatementNotificationEvent_statementId_idx" ON "BrankasStatementNotificationEvent"("statementId");

-- CreateIndex
CREATE INDEX "BrankasStatementNotificationEvent_notificationId_idx" ON "BrankasStatementNotificationEvent"("notificationId");

-- CreateIndex
CREATE INDEX "BrankasStatementNotificationEvent_statementStatus_idx" ON "BrankasStatementNotificationEvent"("statementStatus");

-- AddForeignKey
ALTER TABLE "BrankasStatementSession" ADD CONSTRAINT "BrankasStatementSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrankasStatementSession" ADD CONSTRAINT "BrankasStatementSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrankasStatementNotificationEvent" ADD CONSTRAINT "BrankasStatementNotificationEvent_brankasSessionId_fkey" FOREIGN KEY ("brankasSessionId") REFERENCES "BrankasStatementSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Clover accesses financial records through its authorized server routes only.
ALTER TABLE "BrankasStatementSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrankasStatementNotificationEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "BrankasStatementSession", "BrankasStatementNotificationEvent" FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
