CREATE TABLE "ClerkIdentityDeletion" (
  "clerkUserId" TEXT PRIMARY KEY,
  "environment" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "ClerkIdentityDeletion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ClerkIdentityDeletion" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "ClerkIdentityDeletion" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "ClerkIdentityDeletion" FROM authenticated; END IF;
END $$;
