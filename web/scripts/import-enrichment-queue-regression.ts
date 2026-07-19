import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  claimNextImportEnrichmentJob,
  completeImportEnrichmentJob,
  getImportEnrichmentJobByImportFileId,
  upsertImportEnrichmentJob,
} from "@/lib/import-enrichment-jobs";
import { shouldRetryImportEnrichmentCleanup } from "@/workers/import-processor";

const main = async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      clerkUserId: `qa-enrichment-${suffix}`,
      email: `qa-enrichment-${suffix}@qa.clover.local`,
      verified: true,
      environment: "test",
      workspaces: {
        create: {
          name: "Import enrichment queue regression",
          type: "personal",
        },
      },
    },
    include: { workspaces: true },
  });
  const workspaceId = user.workspaces[0]!.id;
  const importFile = await prisma.importFile.create({
    data: {
      workspaceId,
      fileName: "enrichment-queue-regression.csv",
      fileType: "text/csv",
      storageKey: `qa/enrichment-queue/${suffix}.csv`,
      status: "done",
    },
  });
  const importFileId = importFile.id;

  try {
    await upsertImportEnrichmentJob({ workspaceId, importFileId, totalRows: 1 });
    const firstLease = await claimNextImportEnrichmentJob({ workerId: "qa-worker-a", importFileId });
    assert.equal(firstLease?.status, "running");
    assert.ok(firstLease?.leaseToken, "The first worker should receive a lease token.");

    await upsertImportEnrichmentJob({
      workspaceId,
      importFileId,
      totalRows: 1,
      phase: "queued",
      forceRequeue: false,
    });
    const afterDuplicateTrigger = await getImportEnrichmentJobByImportFileId(importFileId);
    assert.equal(afterDuplicateTrigger?.status, "running", "A duplicate trigger must not requeue running work.");
    assert.equal(afterDuplicateTrigger?.lockedBy, "qa-worker-a", "A duplicate trigger must preserve the worker lock.");
    assert.equal(afterDuplicateTrigger?.leaseToken, firstLease?.leaseToken, "A duplicate trigger must preserve the lease.");
    assert.equal(afterDuplicateTrigger?.attempts, 1, "A duplicate trigger must not consume another attempt.");

    const competingLease = await claimNextImportEnrichmentJob({ workerId: "qa-worker-b", importFileId });
    assert.equal(competingLease, null, "A second worker must not claim an actively leased job.");

    await completeImportEnrichmentJob({
      id: firstLease!.id,
      totalRows: 1,
      workerId: "qa-worker-a",
      leaseToken: firstLease!.leaseToken,
    });

    assert.equal(
      shouldRetryImportEnrichmentCleanup({ attempt: 1, cleanupRowsBeforeAttempt: 1, remainingCleanupRows: 1 }),
      true,
      "An unresolved first pass should receive the stronger deterministic second pass."
    );
    assert.equal(
      shouldRetryImportEnrichmentCleanup({ attempt: 2, cleanupRowsBeforeAttempt: 1, remainingCleanupRows: 1 }),
      false,
      "An unchanged second pass should stop instead of repeating identical work."
    );
    assert.equal(
      shouldRetryImportEnrichmentCleanup({ attempt: 2, cleanupRowsBeforeAttempt: 2, remainingCleanupRows: 1 }),
      true,
      "A productive second pass may continue to finish remaining rows."
    );

    console.log("[PASS] Import enrichment leases resist duplicate triggers and no-progress retries stop after two passes.");
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => null);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => null);
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await prisma.$disconnect().catch(() => null);
  process.exitCode = 1;
});
