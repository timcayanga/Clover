import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { upsertImportEnrichmentJob } from "@/lib/import-enrichment-jobs";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { processImportEnrichmentJobs } from "@/workers/import-processor";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const runSchema = z.object({
  importFileId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(10).optional(),
  batchSize: z.number().int().min(10).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const payload = runSchema.parse(await request.json().catch(() => ({})));

    if (payload.importFileId) {
      const importFile = await fetchImportFileCompat(payload.importFileId);
      if (!importFile) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }
      if (!localDev) {
        await assertWorkspaceAccess(userId, String(importFile.workspaceId));
      }
      const [parsedRowCount, needsCleanupCount] = await Promise.all([
        prisma.parsedTransaction.count({ where: { importFileId: payload.importFileId } }),
        prisma.transaction.count({
          where: {
            importFileId: payload.importFileId,
            deletedAt: null,
            reviewStatus: { notIn: ["confirmed", "edited", "rejected"] },
            OR: [{ merchantClean: null }, { categoryId: null }, { category: { is: { name: "Other" } } }],
          },
        }),
      ]);
      if (parsedRowCount > 0 && needsCleanupCount > 0) {
        await upsertImportEnrichmentJob({
          workspaceId: String(importFile.workspaceId),
          importFileId: payload.importFileId,
          totalRows: parsedRowCount,
          phase: "queued",
          forceRequeue: true,
        });
      }
    } else if (!localDev) {
      return NextResponse.json({ error: "importFileId is required" }, { status: 400 });
    }

    const result = await processImportEnrichmentJobs({
      importFileId: payload.importFileId ?? null,
      limit: payload.limit,
      batchSize: payload.batchSize,
      workerId: `api-import-enrichment-${userId}`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run import enrichment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
