import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat } from "@/lib/data-engine";
import {
  completeImportEnrichmentJob,
  isImportEnrichmentJobStale,
  upsertImportEnrichmentJob,
} from "@/lib/import-enrichment-jobs";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { prisma } from "@/lib/prisma";
import { processImportEnrichmentJobs } from "@/workers/import-processor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();

    const importFile = await fetchImportFileCompat(importId);
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    const snapshot = await loadImportStatusSnapshot(importId, {
      importFile,
      promoteFailedVisibleImport: true,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const shouldSelfHealEnrichment =
      snapshot.visibleImportComplete &&
      (!snapshot.enrichmentJob ||
        snapshot.enrichmentJob.status === "queued" ||
        snapshot.enrichmentJob.status === "retrying" ||
        snapshot.enrichmentJob.status === "done" ||
        snapshot.enrichmentJob.status === "failed" ||
        isImportEnrichmentJobStale(snapshot.enrichmentJob));
    if (shouldSelfHealEnrichment) {
      const [parsedRowCount, needsCleanupCount] = await Promise.all([
        prisma.parsedTransaction.count({ where: { importFileId: importId } }),
        prisma.transaction.count({
          where: {
            deletedAt: null,
            OR: [
              { importFileId: importId },
              {
                rawPayload: {
                  path: ["sourceImportFileId"],
                  equals: importId,
                },
              },
            ],
            reviewStatus: { notIn: ["edited", "rejected", "duplicate_skipped"] },
            AND: [
              {
                OR: [{ merchantClean: null }, { categoryId: null }, { category: { is: { name: "Other" } } }],
              },
            ],
          },
        }),
      ]);
      if (parsedRowCount > 0 && needsCleanupCount > 0) {
        await upsertImportEnrichmentJob({
          workspaceId: String(importFile.workspaceId),
          importFileId: importId,
          totalRows: parsedRowCount,
          phase: "queued",
          forceRequeue: true,
        });
        const result = await processImportEnrichmentJobs({
          importFileId: importId,
          limit: 1,
          batchSize: 100,
          workerId: `status-import-enrichment-${userId}`,
        });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({ ...refreshedSnapshot, enrichmentSelfHeal: result });
        }
      } else if (snapshot.enrichmentJob && needsCleanupCount === 0 && snapshot.enrichmentJob.status !== "done") {
        await completeImportEnrichmentJob({ id: snapshot.enrichmentJob.id, totalRows: parsedRowCount });
        const refreshedSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        if (refreshedSnapshot) {
          return NextResponse.json({ ...refreshedSnapshot, enrichmentSelfHeal: { processedJobs: 0, results: [] } });
        }
      }
    }

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "Unable to load import status" }, { status: 400 });
  }
}
