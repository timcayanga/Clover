ALTER TABLE "SplitBillGroup" ADD COLUMN "shareToken" TEXT;

CREATE UNIQUE INDEX "SplitBillGroup_shareToken_key" ON "SplitBillGroup"("shareToken");

CREATE TABLE "SplitBillGroupCollaborator" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SplitBillGroupCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SplitBillGroupCollaborator_groupId_userId_key" ON "SplitBillGroupCollaborator"("groupId", "userId");
CREATE INDEX "SplitBillGroupCollaborator_userId_idx" ON "SplitBillGroupCollaborator"("userId");

ALTER TABLE "SplitBillGroupCollaborator" ADD CONSTRAINT "SplitBillGroupCollaborator_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitBillGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SplitBillGroupCollaborator" ADD CONSTRAINT "SplitBillGroupCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
