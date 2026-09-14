CREATE TABLE IF NOT EXISTS "MobileOfflineMutation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileOfflineMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileOfflineMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileOfflineMutation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MobileOfflineMutation_userId_operationId_key" ON "MobileOfflineMutation"("userId", "operationId");
CREATE INDEX IF NOT EXISTS "MobileOfflineMutation_workspaceId_idx" ON "MobileOfflineMutation"("workspaceId");
ALTER TABLE "MobileOfflineMutation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MobileOfflineMutation" FROM anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS "MobileLocalAllowance" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "deviceId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "issued" INTEGER NOT NULL CHECK ("issued" > 0),
  "used" INTEGER NOT NULL DEFAULT 0 CHECK ("used" >= 0 AND "used" <= "issued"),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MobileLocalAllowance_userId_month_idx" ON "MobileLocalAllowance"("userId", "month");
ALTER TABLE "MobileLocalAllowance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MobileLocalAllowance" FROM anon, authenticated, service_role;
