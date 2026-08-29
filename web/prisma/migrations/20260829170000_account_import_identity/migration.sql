ALTER TABLE "Account"
ADD COLUMN IF NOT EXISTS "importIdentityName" TEXT,
ADD COLUMN IF NOT EXISTS "importIdentityInstitution" TEXT,
ADD COLUMN IF NOT EXISTS "importIdentityAccountNumber" TEXT,
ADD COLUMN IF NOT EXISTS "nameCustomized" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "institutionCustomized" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "logoCustomized" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "Account" AS account
SET
  "importIdentityName" = COALESCE(
    (
      SELECT rule."accountName"
      FROM "AccountRule" AS rule
      WHERE rule."accountId" = account."id"
        AND rule."source" <> 'manual_account_update'
      ORDER BY rule."createdAt" ASC
      LIMIT 1
    ),
    CASE WHEN account."source" = 'upload' THEN account."name" ELSE NULL END
  ),
  "importIdentityInstitution" = COALESCE(
    (
      SELECT rule."institution"
      FROM "AccountRule" AS rule
      WHERE rule."accountId" = account."id"
        AND rule."source" <> 'manual_account_update'
        AND rule."institution" IS NOT NULL
      ORDER BY rule."createdAt" ASC
      LIMIT 1
    ),
    CASE WHEN account."source" = 'upload' THEN account."institution" ELSE NULL END
  ),
  "importIdentityAccountNumber" = CASE WHEN account."source" = 'upload' THEN account."accountNumber" ELSE NULL END,
  "nameCustomized" = EXISTS (
    SELECT 1
    FROM "AccountRule" AS rule
    WHERE rule."accountId" = account."id"
      AND rule."source" = 'manual_account_update'
      AND lower(trim(rule."accountName")) = lower(trim(account."name"))
  ),
  "logoCustomized" = account."logoUrl" IS NOT NULL;
