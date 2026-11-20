ALTER TABLE "SplitBillGroupMember" ADD COLUMN "previousNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
