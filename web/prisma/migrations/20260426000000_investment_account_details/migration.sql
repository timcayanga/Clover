-- AlterTable
ALTER TABLE "Account"
ADD COLUMN     "investmentSubtype" TEXT,
ADD COLUMN     "investmentSymbol" TEXT,
ADD COLUMN     "investmentQuantity" DECIMAL(18,8),
ADD COLUMN     "investmentCostBasis" DECIMAL(18,2),
ADD COLUMN     "investmentPrincipal" DECIMAL(18,2),
ADD COLUMN     "investmentStartDate" TIMESTAMP(3),
ADD COLUMN     "investmentMaturityDate" TIMESTAMP(3),
ADD COLUMN     "investmentInterestRate" DECIMAL(9,4),
ADD COLUMN     "investmentMaturityValue" DECIMAL(18,2);
