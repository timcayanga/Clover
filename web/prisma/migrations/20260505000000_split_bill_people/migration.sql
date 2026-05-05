-- CreateTable
CREATE TABLE "SplitBillPerson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SplitBillPerson_userId_idx" ON "SplitBillPerson"("userId");

-- AddForeignKey
ALTER TABLE "SplitBillPerson" ADD CONSTRAINT "SplitBillPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
