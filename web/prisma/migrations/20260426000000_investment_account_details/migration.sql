-- AlterTable
ALTER TABLE "Account"
ADD COLUMN     "investmentSymbol" TEXT,
ADD COLUMN     "investmentCostBasis" DECIMAL(18,2);
