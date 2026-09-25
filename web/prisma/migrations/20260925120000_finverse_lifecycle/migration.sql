ALTER TABLE "FinverseConnection"
 ADD COLUMN "disconnectRequestedAt" TIMESTAMP(3),
 ADD COLUMN "disconnectReason" TEXT,
 ADD COLUMN "disconnectError" TEXT,
 ADD COLUMN "disconnectAttempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "disconnectRetryAt" TIMESTAMP(3),
 ADD COLUMN "disconnectedAt" TIMESTAMP(3),
 ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3),
 ADD COLUMN "inactivityWarnedAt" TIMESTAMP(3);
ALTER TABLE "FinverseAccountLink" ADD COLUMN "retainOnDowngrade" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "FinverseConnection_disconnectRetryAt_idx" ON "FinverseConnection" ("disconnectRetryAt");

ALTER TABLE "FinverseConnection" ADD COLUMN "syncFailureSince" TIMESTAMP(3);
