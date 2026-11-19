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

-- Only the trusted application connection may manage promotional configuration.
ALTER TABLE "HomeBannerConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HomeBannerAsset" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "HomeBannerConfig", "HomeBannerAsset" FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON "HomeBannerConfig", "HomeBannerAsset" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
