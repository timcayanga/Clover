ALTER TABLE "TrainingSignal" ADD COLUMN "dedupeKey" TEXT;

UPDATE "TrainingSignal"
SET "dedupeKey" = concat_ws(
  '|',
  "source",
  COALESCE("transactionId", ''),
  COALESCE("importFileId", ''),
  "merchantKey",
  "categoryId",
  "type"::text
);

DELETE FROM "TrainingSignal" target
USING (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY "workspaceId", "dedupeKey"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS row_num
  FROM "TrainingSignal"
) ranked
WHERE target.ctid = ranked.ctid
  AND ranked.row_num > 1;

ALTER TABLE "TrainingSignal" ALTER COLUMN "dedupeKey" SET NOT NULL;

CREATE UNIQUE INDEX "TrainingSignal_workspaceId_dedupeKey_key"
  ON "TrainingSignal"("workspaceId", "dedupeKey");
