CREATE TABLE "SwitchReviewMail" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "eventId" TEXT NOT NULL,
 "tokenHash" TEXT,
 "expiresAt" TIMESTAMP(3),
 "consumedAt" TIMESTAMP(3),
 "emailStatus" TEXT NOT NULL DEFAULT 'pending',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SwitchReviewMail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SwitchEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SwitchReviewMail_eventId_key" ON "SwitchReviewMail"("eventId");
CREATE UNIQUE INDEX "SwitchReviewMail_tokenHash_key" ON "SwitchReviewMail"("tokenHash");
CREATE INDEX "SwitchReviewMail_emailStatus_createdAt_idx" ON "SwitchReviewMail"("emailStatus", "createdAt");
ALTER TABLE "SwitchReviewMail" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SwitchReviewMail" FROM PUBLIC;
DO $$ DECLARE api_role TEXT; BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN EXECUTE format('REVOKE ALL ON "SwitchReviewMail" FROM %I',api_role); END IF;
 END LOOP;
END $$;

-- Notify reviewers of already-pending applications once, never decided history.
INSERT INTO "SwitchReviewMail" ("id","eventId","updatedAt")
SELECT 'switch-review:' || pending."id", pending."id", CURRENT_TIMESTAMP
FROM (
 SELECT DISTINCT ON (event."applicationId") event."id", event."applicationId"
 FROM "SwitchEvent" event JOIN "SwitchApplication" application ON application."id"=event."applicationId"
 WHERE application."status"='submitted' AND event."kind" LIKE 'submitted:%'
 ORDER BY event."applicationId", event."createdAt" DESC, event."id" DESC
) pending
ON CONFLICT ("eventId") DO NOTHING;
