-- CreateEnum
CREATE TYPE "FinancialExperienceLevel" AS ENUM ('beginner', 'comfortable', 'advanced');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "financialExperience" "FinancialExperienceLevel" NOT NULL DEFAULT 'beginner';
