-- Category metadata is required by workspace bootstrap and category management.
-- IF NOT EXISTS keeps this migration safe for databases that received the
-- columns through an earlier manual schema sync.
ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
