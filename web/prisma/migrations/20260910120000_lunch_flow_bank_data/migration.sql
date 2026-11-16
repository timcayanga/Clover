CREATE TABLE "LunchFlowConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "stateExpiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'link_pending',
  "externalUserId" TEXT,
  "encryptedAccessToken" TEXT,
  "encryptedRefreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "syncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LunchFlowConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LunchFlowAccountLink" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "externalConnectionId" TEXT,
  "accountId" TEXT,
  "rawPayload" JSONB NOT NULL,
  "normalizedPayload" JSONB NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LunchFlowAccountLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LunchFlowTransactionRecord" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "externalTransactionId" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "transactionId" TEXT,
  "rawPayload" JSONB NOT NULL,
  "normalizedPayload" JSONB NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LunchFlowTransactionRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LunchFlowConnection_workspaceId_key" ON "LunchFlowConnection"("workspaceId");
CREATE UNIQUE INDEX "LunchFlowConnection_stateHash_key" ON "LunchFlowConnection"("stateHash");
CREATE INDEX "LunchFlowConnection_userId_idx" ON "LunchFlowConnection"("userId");
CREATE INDEX "LunchFlowConnection_workspaceId_status_idx" ON "LunchFlowConnection"("workspaceId", "status");
CREATE UNIQUE INDEX "LunchFlowAccountLink_accountId_key" ON "LunchFlowAccountLink"("accountId");
CREATE UNIQUE INDEX "LunchFlowAccountLink_connectionId_externalAccountId_key" ON "LunchFlowAccountLink"("connectionId", "externalAccountId");
CREATE INDEX "LunchFlowAccountLink_workspaceId_idx" ON "LunchFlowAccountLink"("workspaceId");
CREATE INDEX "LunchFlowAccountLink_connectionId_externalConnectionId_idx" ON "LunchFlowAccountLink"("connectionId", "externalConnectionId");
CREATE UNIQUE INDEX "LunchFlowTransactionRecord_transactionId_key" ON "LunchFlowTransactionRecord"("transactionId");
CREATE UNIQUE INDEX "LunchFlowTransactionRecord_connectionId_externalTransactionId_key" ON "LunchFlowTransactionRecord"("connectionId", "externalTransactionId");
CREATE INDEX "LunchFlowTransactionRecord_connectionId_externalAccountId_idx" ON "LunchFlowTransactionRecord"("connectionId", "externalAccountId");

ALTER TABLE "LunchFlowConnection" ADD CONSTRAINT "LunchFlowConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LunchFlowConnection" ADD CONSTRAINT "LunchFlowConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LunchFlowAccountLink" ADD CONSTRAINT "LunchFlowAccountLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "LunchFlowConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LunchFlowAccountLink" ADD CONSTRAINT "LunchFlowAccountLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LunchFlowAccountLink" ADD CONSTRAINT "LunchFlowAccountLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LunchFlowTransactionRecord" ADD CONSTRAINT "LunchFlowTransactionRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "LunchFlowConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LunchFlowTransactionRecord" ADD CONSTRAINT "LunchFlowTransactionRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LunchFlowConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LunchFlowAccountLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LunchFlowTransactionRecord" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LunchFlowConnection", "LunchFlowAccountLink", "LunchFlowTransactionRecord" FROM anon, authenticated, service_role;
