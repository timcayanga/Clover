-- CreateEnum
CREATE TYPE "SplitBillSourceType" AS ENUM ('manual', 'receipt');

-- CreateTable
CREATE TABLE "SplitBillGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBillGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "sourceType" "SplitBillSourceType" NOT NULL DEFAULT 'manual',
    "merchantName" TEXT,
    "receiptFileName" TEXT,
    "receiptMimeType" TEXT,
    "receiptText" TEXT,
    "receiptConfidence" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2),
    "tax" DECIMAL(18,2),
    "tip" DECIMAL(18,2),
    "discount" DECIMAL(18,2),
    "total" DECIMAL(18,2),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBillParticipant" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBillItemParticipant" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitBillItemParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBillPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SplitBillGroup_userId_idx" ON "SplitBillGroup"("userId");

-- CreateIndex
CREATE INDEX "SplitBillGroupMember_groupId_idx" ON "SplitBillGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "SplitBill_userId_idx" ON "SplitBill"("userId");

-- CreateIndex
CREATE INDEX "SplitBill_groupId_idx" ON "SplitBill"("groupId");

-- CreateIndex
CREATE INDEX "SplitBill_billDate_idx" ON "SplitBill"("billDate");

-- CreateIndex
CREATE INDEX "SplitBill_sourceType_idx" ON "SplitBill"("sourceType");

-- CreateIndex
CREATE INDEX "SplitBillParticipant_billId_idx" ON "SplitBillParticipant"("billId");

-- CreateIndex
CREATE INDEX "SplitBillItem_billId_idx" ON "SplitBillItem"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "SplitBillItemParticipant_itemId_participantId_key" ON "SplitBillItemParticipant"("itemId", "participantId");

-- CreateIndex
CREATE INDEX "SplitBillItemParticipant_itemId_idx" ON "SplitBillItemParticipant"("itemId");

-- CreateIndex
CREATE INDEX "SplitBillItemParticipant_participantId_idx" ON "SplitBillItemParticipant"("participantId");

-- CreateIndex
CREATE INDEX "SplitBillPayment_billId_idx" ON "SplitBillPayment"("billId");

-- CreateIndex
CREATE INDEX "SplitBillPayment_participantId_idx" ON "SplitBillPayment"("participantId");

-- AddForeignKey
ALTER TABLE "SplitBillGroup" ADD CONSTRAINT "SplitBillGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillGroupMember" ADD CONSTRAINT "SplitBillGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitBillGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBill" ADD CONSTRAINT "SplitBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBill" ADD CONSTRAINT "SplitBill_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitBillGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillParticipant" ADD CONSTRAINT "SplitBillParticipant_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SplitBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillItem" ADD CONSTRAINT "SplitBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SplitBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillItemParticipant" ADD CONSTRAINT "SplitBillItemParticipant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SplitBillItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillItemParticipant" ADD CONSTRAINT "SplitBillItemParticipant_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SplitBillParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillPayment" ADD CONSTRAINT "SplitBillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SplitBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillPayment" ADD CONSTRAINT "SplitBillPayment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SplitBillParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
