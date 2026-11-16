ALTER TABLE "CircleSharedTransaction" ADD COLUMN "paidByMemberId" TEXT;
CREATE INDEX "CircleSharedTransaction_paidByMemberId_idx" ON "CircleSharedTransaction"("paidByMemberId");
ALTER TABLE "CircleSharedTransaction" ADD CONSTRAINT "CircleSharedTransaction_paidByMemberId_fkey"
  FOREIGN KEY ("paidByMemberId") REFERENCES "CircleMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
