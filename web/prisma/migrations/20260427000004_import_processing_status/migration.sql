ALTER TABLE "ImportFile"
ADD COLUMN "processingPhase" TEXT,
ADD COLUMN "processingMessage" TEXT,
ADD COLUMN "processingAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processingTargetScore" INTEGER,
ADD COLUMN "processingCurrentScore" INTEGER;
