import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeCheckpointSourceMetadata } from "@/lib/import-workflow";
import type { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";

type Snapshot = Awaited<ReturnType<typeof loadImportStatusSnapshot>>;

export function shouldPersistPublishedAccountSummaries(snapshot: Snapshot) {
  if (!snapshot?.statementCheckpoint || !snapshot.accountSummaries.length) return false;
  const source = snapshot.statementCheckpoint.sourceMetadata;
  const metadata = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  // PostgreSQL JSONB reorders object keys. String equality caused every status
  // poll to rewrite an otherwise identical checkpoint and its updatedAt.
  return metadata.publishedVisibleImportComplete !== snapshot.visibleImportComplete ||
    !isDeepStrictEqual(metadata.publishedAccountSummaries, JSON.parse(JSON.stringify(snapshot.accountSummaries)));
}

export async function persistPublishedAccountSummaries(snapshot: Snapshot, db: Prisma.TransactionClient = prisma) {
  if (!snapshot?.statementCheckpoint || !shouldPersistPublishedAccountSummaries(snapshot)) return { count: 0 };
  const checkpoint = snapshot.statementCheckpoint;
  // A delayed status response must never overwrite a newer reconciliation or
  // any other checkpoint edit with its stale full metadata snapshot.
  return db.accountStatementCheckpoint.updateMany({
    where: { id: checkpoint.id, workspaceId: checkpoint.workspaceId, updatedAt: checkpoint.updatedAt },
    data: { sourceMetadata: mergeCheckpointSourceMetadata(checkpoint.sourceMetadata, {
      publishedVisibleImportComplete: snapshot.visibleImportComplete,
      publishedAccountSummaries: snapshot.accountSummaries,
    }) as Prisma.InputJsonValue },
  });
}
