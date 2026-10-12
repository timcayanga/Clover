import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeCheckpointSourceMetadata } from "@/lib/import-workflow";
import type { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";

type Snapshot = Awaited<ReturnType<typeof loadImportStatusSnapshot>>;

const comparableSummaries = (value: unknown) => {
  if (!Array.isArray(value)) return value;
  return value.map(summary => {
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) return summary;
    const balance = summary.balance;
    // A native proof may publish "34.10" while Prisma reads the same decimal
    // as "34.1". Compare exact decimal values without changing stored evidence
    // or treating an absent balance as zero.
    if (typeof balance !== "string" || !/^-?\d+(?:\.\d+)?$/.test(balance)) return summary;
    return { ...summary, balance: new Prisma.Decimal(balance).toString() };
  });
};

export function shouldPersistPublishedAccountSummaries(snapshot: Snapshot) {
  if (!snapshot?.statementCheckpoint || !snapshot.accountSummaries.length) return false;
  const source = snapshot.statementCheckpoint.sourceMetadata;
  const metadata = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  // PostgreSQL JSONB reorders object keys. String equality caused every status
  // poll to rewrite an otherwise identical checkpoint and its updatedAt.
  return metadata.publishedVisibleImportComplete !== snapshot.visibleImportComplete ||
    !isDeepStrictEqual(comparableSummaries(metadata.publishedAccountSummaries), comparableSummaries(JSON.parse(JSON.stringify(snapshot.accountSummaries))));
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
