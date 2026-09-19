CREATE TABLE "AdviserConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "messages" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdviserConversation_userId_workspaceId_updatedAt_idx" ON "AdviserConversation"("userId", "workspaceId", "updatedAt" DESC);
ALTER TABLE "AdviserConversation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdviserConversation" FROM anon, authenticated;
