CREATE TABLE "KnowledgeFeedback" (
  "path" TEXT NOT NULL, "voter" TEXT NOT NULL, "helpful" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeFeedback_pkey" PRIMARY KEY ("path", "voter")
);
ALTER TABLE "KnowledgeFeedback" ENABLE ROW LEVEL SECURITY;
