CREATE TABLE "FinverseConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "stateExpiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'link_pending',
  "loginIdentityId" TEXT,
  "institutionId" TEXT,
  "institutionName" TEXT,
  "encryptedAccessToken" TEXT,
  "encryptedRefreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "rawLoginIdentity" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "syncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinverseConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinverseAccountLink" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "accountId" TEXT,
  "rawPayload" JSONB NOT NULL,
  "normalizedPayload" JSONB NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinverseAccountLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinverseTransactionRecord" (
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
  CONSTRAINT "FinverseTransactionRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinverseConnection_stateHash_key" ON "FinverseConnection"("stateHash");
CREATE UNIQUE INDEX "FinverseConnection_loginIdentityId_key" ON "FinverseConnection"("loginIdentityId");
CREATE INDEX "FinverseConnection_userId_idx" ON "FinverseConnection"("userId");
CREATE INDEX "FinverseConnection_workspaceId_idx" ON "FinverseConnection"("workspaceId");
CREATE INDEX "FinverseConnection_workspaceId_status_idx" ON "FinverseConnection"("workspaceId", "status");
CREATE UNIQUE INDEX "FinverseAccountLink_accountId_key" ON "FinverseAccountLink"("accountId");
CREATE UNIQUE INDEX "FinverseAccountLink_connectionId_externalAccountId_key" ON "FinverseAccountLink"("connectionId", "externalAccountId");
CREATE INDEX "FinverseAccountLink_workspaceId_idx" ON "FinverseAccountLink"("workspaceId");
CREATE UNIQUE INDEX "FinverseTransactionRecord_transactionId_key" ON "FinverseTransactionRecord"("transactionId");
CREATE UNIQUE INDEX "FinverseTransactionRecord_connectionId_externalTransactionId_key" ON "FinverseTransactionRecord"("connectionId", "externalTransactionId");
CREATE INDEX "FinverseTransactionRecord_connectionId_externalAccountId_idx" ON "FinverseTransactionRecord"("connectionId", "externalAccountId");

ALTER TABLE "FinverseConnection" ADD CONSTRAINT "FinverseConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinverseConnection" ADD CONSTRAINT "FinverseConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinverseAccountLink" ADD CONSTRAINT "FinverseAccountLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FinverseConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinverseAccountLink" ADD CONSTRAINT "FinverseAccountLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinverseAccountLink" ADD CONSTRAINT "FinverseAccountLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinverseTransactionRecord" ADD CONSTRAINT "FinverseTransactionRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FinverseConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinverseTransactionRecord" ADD CONSTRAINT "FinverseTransactionRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinverseConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinverseAccountLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinverseTransactionRecord" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "FinverseConnection", "FinverseAccountLink", "FinverseTransactionRecord" FROM anon, authenticated, service_role;
