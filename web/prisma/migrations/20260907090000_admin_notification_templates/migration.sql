CREATE TABLE "NotificationTemplate" (
  "key" TEXT NOT NULL, "environment" TEXT NOT NULL, "name" TEXT NOT NULL,
  "triggerKey" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "inApp" BOOLEAN NOT NULL DEFAULT true, "email" BOOLEAN NOT NULL DEFAULT false,
  "title" TEXT NOT NULL, "body" TEXT NOT NULL, "ctaLabel" TEXT NOT NULL,
  "emailSubject" TEXT NOT NULL, "emailBody" TEXT NOT NULL, "emailEnabledAt" TIMESTAMP(3),
  "archived" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("environment", "key")
);
CREATE TABLE "NotificationTemplateAudit" (
  "id" TEXT NOT NULL PRIMARY KEY, "environment" TEXT NOT NULL, "templateKey" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "before" JSONB, "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NotificationTemplateAudit_environment_createdAt_idx" ON "NotificationTemplateAudit"("environment", "createdAt");
CREATE TABLE "NotificationEmailDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY, "environment" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'sending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "NotificationEmailDelivery_dedupe_key"
  ON "NotificationEmailDelivery"("environment", "userId", "templateKey", "eventKey");
CREATE INDEX "NotificationEmailDelivery_environment_createdAt_idx" ON "NotificationEmailDelivery"("environment", "createdAt");
CREATE TABLE "NotificationDispatchCursor" (
  "environment" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL DEFAULT '', "leaseUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "NotificationTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationTemplateAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationEmailDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDispatchCursor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "NotificationTemplate", "NotificationTemplateAudit", "NotificationEmailDelivery", "NotificationDispatchCursor" FROM anon, authenticated, service_role;
