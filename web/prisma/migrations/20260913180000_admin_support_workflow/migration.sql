ALTER TABLE "ContactInquiry" ADD COLUMN "assignedTo" TEXT, ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low','normal','high','urgent')), ADD COLUMN "snoozedUntil" TIMESTAMP(3);
CREATE TABLE "AdminSupportMessage" (
 "id" TEXT PRIMARY KEY, "inquiryId" TEXT NOT NULL REFERENCES "ContactInquiry"("id") ON DELETE CASCADE,
 "actorId" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK ("kind" IN ('reply','note','assignment')),
 "subject" TEXT, "body" TEXT NOT NULL, "status" TEXT NOT NULL CHECK ("status" IN ('sending','sent','unknown','failed','internal')),
 "idempotencyKey" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AdminSupportMessage_inquiryId_createdAt_idx" ON "AdminSupportMessage"("inquiryId", "createdAt");
ALTER TABLE "AdminSupportMessage" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "AdminSupportMessage" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "AdminSupportMessage" FROM authenticated; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON "AdminSupportMessage" FROM service_role; END IF;
END $$;
