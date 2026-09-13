CREATE TABLE "StoreAccess" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "expiresAt" TIMESTAMP(3), "store" TEXT, "productId" TEXT, "sandbox" BOOLEAN NOT NULL,
 "renewing" BOOLEAN NOT NULL DEFAULT false, "verifiedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "StoreAccess" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "StoreAccess" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "StoreAccess" FROM authenticated; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON "StoreAccess" FROM service_role; END IF;
END $$;
