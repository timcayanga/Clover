-- Create reusable workspace tags and link them to transactions.
CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionTag" (
  "transactionId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId", "tagId")
);

CREATE UNIQUE INDEX "Tag_workspaceId_normalizedName_key" ON "Tag"("workspaceId", "normalizedName");
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");
CREATE INDEX "TransactionTag_tagId_idx" ON "TransactionTag"("tagId");
CREATE INDEX "TransactionTag_transactionId_idx" ON "TransactionTag"("transactionId");

ALTER TABLE "Tag"
ADD CONSTRAINT "Tag_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionTag"
ADD CONSTRAINT "TransactionTag_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionTag"
ADD CONSTRAINT "TransactionTag_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "Tag"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
