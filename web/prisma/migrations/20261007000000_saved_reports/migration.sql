CREATE TABLE "SavedReport" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "view" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SavedReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SavedReport_workspaceId_updatedAt_idx" ON "SavedReport"("workspaceId", "updatedAt");
ALTER TABLE "SavedReport" ENABLE ROW LEVEL SECURITY;
