import { prisma } from "@/lib/prisma";

export type ImportEnrichmentJobStatus = "queued" | "running" | "done" | "failed" | "retrying";

export const MAX_IMPORT_ENRICHMENT_ATTEMPTS = 3;

export type ImportEnrichmentJobRow = {
  id: string;
  workspaceId: string;
  importFileId: string;
  status: ImportEnrichmentJobStatus;
  phase: string;
  lastRowIndex: number;
  totalRows: number;
  processedRows: number;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

let ensureTablePromise: Promise<void> | null = null;

export const ensureImportEnrichmentJobTable = async () => {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "ImportEnrichmentJobStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'retrying');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ImportEnrichmentJob" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "importFileId" TEXT NOT NULL,
          "status" "ImportEnrichmentJobStatus" NOT NULL DEFAULT 'queued',
          "phase" TEXT NOT NULL DEFAULT 'queued',
          "lastRowIndex" INTEGER NOT NULL DEFAULT 0,
          "totalRows" INTEGER NOT NULL DEFAULT 0,
          "processedRows" INTEGER NOT NULL DEFAULT 0,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "errorCode" TEXT,
          "errorMessage" TEXT,
          "lockedAt" TIMESTAMP(3),
          "lockedBy" TEXT,
          "startedAt" TIMESTAMP(3),
          "completedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ImportEnrichmentJob_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ImportEnrichmentJob_importFileId_key" ON "ImportEnrichmentJob"("importFileId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_workspaceId_idx" ON "ImportEnrichmentJob"("workspaceId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_status_idx" ON "ImportEnrichmentJob"("status")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_lockedAt_idx" ON "ImportEnrichmentJob"("lockedAt")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ImportEnrichmentJob_updatedAt_idx" ON "ImportEnrichmentJob"("updatedAt")`);
    })();
  }

  return ensureTablePromise;
};

const normalizeJob = (row: ImportEnrichmentJobRow): ImportEnrichmentJobRow => ({
  ...row,
  lastRowIndex: Number(row.lastRowIndex ?? 0),
  totalRows: Number(row.totalRows ?? 0),
  processedRows: Number(row.processedRows ?? 0),
  attempts: Number(row.attempts ?? 0),
});

export const upsertImportEnrichmentJob = async (params: {
  workspaceId: string;
  importFileId: string;
  totalRows: number;
  phase?: string;
  forceRequeue?: boolean;
}) => {
  await ensureImportEnrichmentJobTable();
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `
      INSERT INTO "ImportEnrichmentJob" (
        "id", "workspaceId", "importFileId", "status", "phase",
        "lastRowIndex", "totalRows", "processedRows", "attempts",
        "errorCode", "errorMessage", "lockedAt", "lockedBy", "startedAt", "completedAt",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, 'queued', $4, 0, $5, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NOW(), NOW())
      ON CONFLICT ("importFileId") DO UPDATE SET
        "workspaceId" = EXCLUDED."workspaceId",
        "status" = CASE
          WHEN $6::boolean THEN 'queued'::"ImportEnrichmentJobStatus"
          WHEN "ImportEnrichmentJob"."status" = 'done' THEN 'done'::"ImportEnrichmentJobStatus"
          ELSE 'queued'::"ImportEnrichmentJobStatus"
        END,
        "phase" = CASE
          WHEN $6::boolean THEN EXCLUDED."phase"
          WHEN "ImportEnrichmentJob"."status" = 'done' THEN "ImportEnrichmentJob"."phase"
          ELSE EXCLUDED."phase"
        END,
        "totalRows" = GREATEST("ImportEnrichmentJob"."totalRows", EXCLUDED."totalRows"),
        "lastRowIndex" = CASE WHEN $6::boolean THEN 0 ELSE "ImportEnrichmentJob"."lastRowIndex" END,
        "processedRows" = CASE WHEN $6::boolean THEN 0 ELSE "ImportEnrichmentJob"."processedRows" END,
        "attempts" = CASE WHEN $6::boolean THEN 0 ELSE "ImportEnrichmentJob"."attempts" END,
        "errorCode" = NULL,
        "errorMessage" = NULL,
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "startedAt" = CASE WHEN $6::boolean THEN NULL ELSE "ImportEnrichmentJob"."startedAt" END,
        "completedAt" = CASE WHEN $6::boolean THEN NULL ELSE "ImportEnrichmentJob"."completedAt" END,
        "updatedAt" = NOW()
      RETURNING *
    `,
    id,
    params.workspaceId,
    params.importFileId,
    params.phase ?? "queued",
    Math.max(0, params.totalRows),
    Boolean(params.forceRequeue)
  );
  return rows[0] ? normalizeJob(rows[0]) : null;
};

export const getImportEnrichmentJobByImportFileId = async (importFileId: string) => {
  await ensureImportEnrichmentJobTable();
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `SELECT * FROM "ImportEnrichmentJob" WHERE "importFileId" = $1 LIMIT 1`,
    importFileId
  );
  return rows[0] ? normalizeJob(rows[0]) : null;
};

export const listImportEnrichmentJobsByWorkspace = async (workspaceId: string) => {
  await ensureImportEnrichmentJobTable();
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `SELECT * FROM "ImportEnrichmentJob" WHERE "workspaceId" = $1 ORDER BY "createdAt" DESC`,
    workspaceId
  );
  return rows.map(normalizeJob);
};

export const claimNextImportEnrichmentJob = async (params: {
  workerId: string;
  staleAfterMs?: number;
  importFileId?: string | null;
}) => {
  await ensureImportEnrichmentJobTable();
  const staleAfterMs = Math.max(10_000, params.staleAfterMs ?? 60_000);
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `
      WITH candidate AS (
        SELECT "id"
        FROM "ImportEnrichmentJob"
        WHERE
          ($3::text IS NULL OR "importFileId" = $3)
          AND (
            "status" IN ('queued', 'retrying')
            OR ("status" = 'running' AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($2::text || ' milliseconds')::interval))
          )
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ImportEnrichmentJob" job
      SET
        "status" = 'running',
        "phase" = CASE WHEN job."phase" = 'queued' THEN 'normalizing' ELSE job."phase" END,
        "attempts" = job."attempts" + 1,
        "lockedAt" = NOW(),
        "lockedBy" = $1,
        "startedAt" = COALESCE(job."startedAt", NOW()),
        "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `,
    params.workerId,
    String(staleAfterMs),
    params.importFileId ?? null
  );
  return rows[0] ? normalizeJob(rows[0]) : null;
};

export const updateImportEnrichmentJobProgress = async (params: {
  id: string;
  phase: string;
  lastRowIndex: number;
  processedRows: number;
  totalRows: number;
  workerId: string;
}) => {
  await ensureImportEnrichmentJobTable();
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `
      UPDATE "ImportEnrichmentJob"
      SET
        "status" = 'queued',
        "phase" = $2,
        "lastRowIndex" = $3,
        "processedRows" = $4,
        "totalRows" = $5,
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING *
    `,
    params.id,
    params.phase,
    Math.max(0, params.lastRowIndex),
    Math.max(0, params.processedRows),
    Math.max(0, params.totalRows),
    params.workerId
  );
  return rows[0] ? normalizeJob(rows[0]) : null;
};

export const completeImportEnrichmentJob = async (params: { id: string; totalRows: number }) => {
  await ensureImportEnrichmentJobTable();
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `
      UPDATE "ImportEnrichmentJob"
      SET
        "status" = 'done',
        "phase" = 'complete',
        "lastRowIndex" = $2,
        "processedRows" = $2,
        "totalRows" = $2,
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "completedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING *
    `,
    params.id,
    Math.max(0, params.totalRows)
  );
  return rows[0] ? normalizeJob(rows[0]) : null;
};

export const failImportEnrichmentJob = async (params: {
  id: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
}) => {
  await ensureImportEnrichmentJobTable();
  const rows = await prisma.$queryRawUnsafe<ImportEnrichmentJobRow[]>(
    `
      UPDATE "ImportEnrichmentJob"
      SET
        "status" = $2::"ImportEnrichmentJobStatus",
        "phase" = 'failed',
        "errorCode" = $3,
        "errorMessage" = $4,
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING *
    `,
    params.id,
    params.retryable ? "retrying" : "failed",
    params.errorCode ?? null,
    params.errorMessage ?? null
  );
  return rows[0] ? normalizeJob(rows[0]) : null;
};
