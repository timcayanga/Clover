import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeImportImageMode, type ImportImageMode } from "./import-image-mode";

export const IMPORT_DISPATCH_ACTION = "import.processing_dispatch";
export const IMPORT_DISPATCH_DELAY_MS = 15_000;
export type ImportDispatchSource = "post_response" | "bullmq" | "status_recovery" | "scheduled_recovery" | "resume";
export type ImportDispatch = {
  id: string;
  queuedAt: string;
  claimedAt?: string;
  recoveryWakeAt?: string;
  importMode: ImportImageMode | null;
  bankName?: string;
  allowDuplicateStatement: boolean;
  visualAttempt?: number;
};

const key = (importId: string) => `import-dispatch-${importId}`;

export async function readImportDispatch(tx: Prisma.TransactionClient, importId: string, workspaceId: string) {
  const row = await tx.auditLog.findUnique({ where: { id: key(importId) } });
  const data = row?.metadata as ImportDispatch | null;
  if (!row || row.workspaceId !== workspaceId || row.entityId !== importId ||
      row.action !== IMPORT_DISPATCH_ACTION || !data?.id || !data?.queuedAt) return null;
  return { row, data };
}

export async function prepareImportDispatch(input: {
  importId: string; workspaceId: string; actorUserId: string; message: string;
  importMode?: ImportImageMode | null; bankName?: string | null;
  allowDuplicateStatement: boolean; nextVisualAttempt?: number; previousDispatchId?: string;
}) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${input.importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: input.importId } });
    if (!file || file.workspaceId !== input.workspaceId || !file.storageKey || file.rawPurgedAt || file.confirmedAt ||
        file.confirmedTransactionsCount > 0 ||
        ["paused", "pause_requested", "cancelled", "cancel_requested", "source_review_required", "receipt_review_required", "account_match_needs_confirmation", "password_required", "non_financial"].includes(file.processingPhase ?? "")) {
      return null;
    }
    const active = await tx.auditLog.findFirst({ where: {
      workspaceId: file.workspaceId, entityId: file.id, action: "import.processing_attempt",
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } });
    const lease = active?.metadata as { outcome?: string; leaseExpiresAt?: string } | null;
    if (lease?.outcome === "running" && Date.parse(lease.leaseExpiresAt ?? "") > Date.now()) return null;
    const pending = await readImportDispatch(tx, file.id, file.workspaceId);
    if (input.previousDispatchId && (pending?.data.id !== input.previousDispatchId || !pending.data.claimedAt)) return null;
    if (pending && !pending.data.claimedAt && file.processingPhase === "queued_retry") return pending.data.id;
    if (input.nextVisualAttempt !== undefined && input.nextVisualAttempt !== file.processingAttempt + 1) return null;
    const metadata: ImportDispatch = {
      id: crypto.randomUUID(), queuedAt: new Date().toISOString(),
      importMode: normalizeImportImageMode(input.importMode),
      ...(input.bankName ? { bankName: input.bankName } : {}),
      allowDuplicateStatement: input.allowDuplicateStatement,
      ...(input.nextVisualAttempt === undefined ? {} : { visualAttempt: input.nextVisualAttempt }),
    };
    await tx.auditLog.upsert({
      where: { id: key(file.id) },
      create: { id: key(file.id), workspaceId: file.workspaceId, entity: "ImportFile", entityId: file.id,
        actorUserId: input.actorUserId, action: IMPORT_DISPATCH_ACTION, metadata },
      update: { actorUserId: input.actorUserId, metadata },
    });
    await tx.importFile.update({ where: { id: file.id }, data: {
      status: "processing", processingPhase: "queued_retry", processingMessage: input.message,
      rawExpiresAt: file.rawExpiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000),
      ...(input.nextVisualAttempt === undefined ? {} : { processingAttempt: input.nextVisualAttempt }),
    } });
    console.info("[import-dispatch]", { importId: file.id, dispatchId: metadata.id, outcome: "requested" });
    return metadata.id;
  });
}

export async function reserveDelayedImportDispatch(importId: string, workspaceId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: importId }, select: {
      workspaceId: true, status: true, processingPhase: true, rawPurgedAt: true, confirmedAt: true,
    } });
    if (!file || file.workspaceId !== workspaceId || file.status !== "processing" || file.rawPurgedAt ||
        file.confirmedAt || !["queued_retry", "reading_account_details", "reconciling"].includes(file.processingPhase ?? "")) return null;
    const entry = await readImportDispatch(tx, importId, workspaceId);
    if (!entry || entry.data.claimedAt) return null;
    const now = Date.now();
    if (now - Date.parse(entry.data.recoveryWakeAt ?? entry.data.queuedAt) < IMPORT_DISPATCH_DELAY_MS) return null;
    await tx.auditLog.update({ where: { id: entry.row.id }, data: {
      metadata: { ...entry.data, recoveryWakeAt: new Date(now).toISOString() },
    } });
    return entry.data;
  });
}
