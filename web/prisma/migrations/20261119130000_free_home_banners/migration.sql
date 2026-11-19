CREATE TABLE "HomeBannerConfig" (
  "environment" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "items" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomeBannerConfig_pkey" PRIMARY KEY ("environment")
);
CREATE TABLE "HomeBannerAsset" (
  "id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomeBannerAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HomeBannerAsset_storageKey_key" ON "HomeBannerAsset"("storageKey");
CREATE INDEX "HomeBannerAsset_environment_createdAt_idx" ON "HomeBannerAsset"("environment", "createdAt");
