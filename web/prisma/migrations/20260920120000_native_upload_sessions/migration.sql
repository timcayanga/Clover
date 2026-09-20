CREATE TABLE "NativeUploadSession" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL, "contentType" TEXT NOT NULL, "size" INTEGER NOT NULL,
  "parts" JSONB NOT NULL DEFAULT '{}', "state" TEXT NOT NULL DEFAULT 'uploading',
  "leaseUntil" TIMESTAMP(3), "response" JSONB, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeUploadSession_size_check" CHECK ("size" > 0 AND "size" <= 26214400),
  CONSTRAINT "NativeUploadSession_state_check" CHECK ("state" IN ('uploading','finalizing','done','cancelled'))
);
CREATE INDEX "NativeUploadSession_expiresAt_idx" ON "NativeUploadSession"("expiresAt");
CREATE INDEX "NativeUploadSession_userId_idx" ON "NativeUploadSession"("userId");
ALTER TABLE "NativeUploadSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "NativeUploadSession" FROM anon, authenticated;
