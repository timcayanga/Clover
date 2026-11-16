DO $$ BEGIN
  CREATE TYPE "LearningRuleStatus" AS ENUM ('candidate', 'active', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "status" "LearningRuleStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "applicationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "correctionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "provenance" JSONB;
ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "negativeExamples" JSONB;
ALTER TABLE "MerchantRule" ADD COLUMN IF NOT EXISTS "lastEvaluatedAt" TIMESTAMP(3);

ALTER TABLE "TrainingSignal" ADD COLUMN IF NOT EXISTS "teachabilityScore" INTEGER;
ALTER TABLE "TrainingSignal" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "TrainingSignal" ADD COLUMN IF NOT EXISTS "fieldName" TEXT;
ALTER TABLE "TrainingSignal" ADD COLUMN IF NOT EXISTS "previousValue" JSONB;
ALTER TABLE "TrainingSignal" ADD COLUMN IF NOT EXISTS "correctedValue" JSONB;
