CREATE TABLE "BudgetRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "sequence" SERIAL NOT NULL UNIQUE,
 "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "budgetId" TEXT NOT NULL, "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "source" TEXT NOT NULL, "snapshot" JSONB NOT NULL
);
CREATE INDEX "BudgetRevision_workspaceId_budgetId_effectiveAt_idx" ON "BudgetRevision"("workspaceId", "budgetId", "effectiveAt");
ALTER TABLE "BudgetRevision" ENABLE ROW LEVEL SECURITY;
-- Existing settings are a baseline, not fabricated historical revisions.
INSERT INTO "BudgetRevision" ("id", "workspaceId", "budgetId", "source", "snapshot")
SELECT gen_random_uuid()::text, b."workspaceId", b.id, 'baseline',
 to_jsonb(b) || jsonb_build_object('categoryName', c.name)
FROM "Budget" b LEFT JOIN "Category" c ON c.id = b."categoryId";

-- Capture all writers (web, native, Ask Clover, account merges), in the same transaction.
CREATE FUNCTION clover_record_budget_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "Budget"; category_name TEXT; payload JSONB;
BEGIN
 IF TG_OP = 'DELETE' THEN b := OLD; ELSE b := NEW; END IF;
 -- A cascading Profile deletion must not recreate its history.
 IF NOT EXISTS (SELECT 1 FROM "Workspace" WHERE id = b."workspaceId") THEN RETURN NULL; END IF;
 IF TG_OP = 'UPDATE' AND
   (to_jsonb(OLD) - 'updatedAt' - 'emoji' - 'planId') = (to_jsonb(NEW) - 'updatedAt' - 'emoji' - 'planId')
 THEN RETURN NULL; END IF;
 SELECT name INTO category_name FROM "Category" WHERE id = b."categoryId";
 payload := to_jsonb(b) || jsonb_build_object('categoryName', category_name);
 IF TG_OP = 'DELETE' THEN payload := payload || '{"isActive":false}'::jsonb; END IF;
 INSERT INTO "BudgetRevision" (id,"workspaceId","budgetId","effectiveAt",source,snapshot)
 VALUES (gen_random_uuid()::text,b."workspaceId",b.id,clock_timestamp() AT TIME ZONE 'UTC',lower(TG_OP),payload);
 RETURN NULL;
END $$;
CREATE TRIGGER clover_budget_revision AFTER INSERT OR UPDATE OR DELETE ON "Budget"
FOR EACH ROW EXECUTE FUNCTION clover_record_budget_revision();
REVOKE ALL ON FUNCTION clover_record_budget_revision() FROM PUBLIC;

CREATE TABLE "ReportRecovery" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "expenseId" TEXT NOT NULL REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "incomingId" TEXT NOT NULL REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('refund','reimbursement')),
 "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("expenseId" <> "incomingId")
);
CREATE UNIQUE INDEX "ReportRecovery_expenseId_incomingId_key" ON "ReportRecovery"("expenseId","incomingId");
CREATE INDEX "ReportRecovery_workspaceId_idx" ON "ReportRecovery"("workspaceId");
CREATE INDEX "ReportRecovery_incomingId_idx" ON "ReportRecovery"("incomingId");
ALTER TABLE "ReportRecovery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "BudgetRevision", "ReportRecovery" FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE "BudgetRevision_sequence_seq" FROM anon, authenticated, service_role;
