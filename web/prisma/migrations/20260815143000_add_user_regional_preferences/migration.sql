ALTER TABLE "User"
ADD COLUMN "regionalPreferences" JSONB,
ADD COLUMN "regionalPreferencesInitializedAt" TIMESTAMP(3);
