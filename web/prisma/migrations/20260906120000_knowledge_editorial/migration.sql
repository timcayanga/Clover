CREATE TABLE "KnowledgeArticle" (
  "path" TEXT PRIMARY KEY, "draft" JSONB NOT NULL, "published" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1, "sortOrder" INTEGER NOT NULL DEFAULT 1000, "draftOrder" INTEGER NOT NULL DEFAULT 1000,
  "archived" BOOLEAN NOT NULL DEFAULT false, "needsReview" BOOLEAN NOT NULL DEFAULT true,
  "origin" TEXT NOT NULL DEFAULT 'admin', "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "KnowledgeRevision" (
  "id" TEXT PRIMARY KEY, "path" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL, "actor" TEXT NOT NULL, "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "KnowledgeRevision_path_createdAt_idx" ON "KnowledgeRevision"("path", "createdAt");
CREATE TABLE "KnowledgeSettings" (
  "id" TEXT PRIMARY KEY DEFAULT 'editorial', "ai" JSONB NOT NULL,
  "categoryOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "KnowledgeGeneration" (
  "id" TEXT PRIMARY KEY, "topic" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'running',
  "details" TEXT, "tokens" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
-- No anonymous database access: public content is served through the application.
ALTER TABLE "KnowledgeArticle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeGeneration" ENABLE ROW LEVEL SECURITY;
