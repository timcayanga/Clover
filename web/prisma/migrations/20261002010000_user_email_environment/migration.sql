-- Keep Clerk identity and all financial ownership unchanged. Legacy staging
-- rows must not reserve an email against a separate production identity.
-- Establish the narrower constraint before removing the global one.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_environment_key" ON "User"("email", "environment");
DROP INDEX IF EXISTS "User_email_key";
