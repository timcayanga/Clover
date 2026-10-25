import { prisma } from "./prisma";
import { creditFailedImportUsage } from "./clover-token-usage";
import { SOURCE_REVIEW_PHASE } from "./import-source-review";
import { RECEIPT_REVIEW_PHASE } from "./receipt-review";

type ResumeRecovery =
  | { kind: "retryable" }
  | { kind: "preserved" | "missing_import" }
  | { kind: "user_control"; control: "paused" | "cancelled" };

/** Trusted callers only: an authorized request or server-owned recovery claim. Never infer empty rows from a failed read. */
export async function recoverFailedImportResume(importId: string, expectedUpdatedAt?: Date): Promise<ResumeRecovery> {
  return prisma.$transaction(async tx => {
    // Confirmation and user controls take this same lock. A late error must not
    // overwrite a save or a cancellation committed while the request was running.
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: importId } });
    if (!file) return { kind: "missing_import" };
    if (expectedUpdatedAt && file.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return { kind: "preserved" };
    const event = await tx.auditLog.findFirst({
      where: { workspaceId: file.workspaceId, entityId: importId, action: "import.user_control" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true },
    });
    const control = (event?.metadata as { control?: string } | null)?.control;
    if (control === "paused" || control === "cancelled") return { kind: "user_control", control };
    if (["pause_requested", "paused", "cancel_requested", "cancelled"].includes(file.processingPhase ?? "")) {
      return { kind: "user_control", control: file.processingPhase?.startsWith("pause") ? "paused" : "cancelled" };
    }
    if (file.status === "done" || file.confirmedAt || file.confirmedTransactionsCount > 0 ||
        file.processingPhase === SOURCE_REVIEW_PHASE || file.processingPhase === RECEIPT_REVIEW_PHASE ||
        file.processingPhase === "password_required" || file.processingPhase === "account_match_needs_confirmation") {
      return { kind: "preserved" };
    }
    // Include legacy raw-payload links and soft-deleted rows: a retry must not
    // resurrect records the user deliberately deleted from a successful import.
    const saved = await tx.transaction.findFirst({
      where: { workspaceId: file.workspaceId, OR: [
        { importFileId: importId },
        { rawPayload: { path: ["sourceImportFileId"], equals: importId } },
      ] }, select: { id: true },
    });
    if (saved) return { kind: "preserved" };
    const parsedRowsCount = Math.max(file.parsedRowsCount, await tx.parsedTransaction.count({where:{importFileId:importId}}));
    const message = "Your file is saved. Retry to continue from its last checkpoint.";
    if (file.status !== "failed" || file.processingPhase !== "repair_needed" || file.processingMessage !== message || file.parsedRowsCount !== parsedRowsCount) {
      await tx.importFile.update({ where: { id: importId }, data: {
        status: "failed", processingPhase: "repair_needed", processingMessage: message, parsedRowsCount,
      } });
    }
    // Keep original provider usage; the separate credit is repeat-safe. Late
    // usage logs are also reconciled by the normal allowance read path.
    await creditFailedImportUsage(importId, tx);
    return { kind: "retryable" };
  });
}

/** Queue only an unchanged empty checkpoint, never a saved/deleted import. */
export async function queueStaleEmptyImportRecovery(importId: string, expectedUpdatedAt: Date, options: { expectedStatus?: "done" | "processing"; nextAttempt?: number } = {}): Promise<boolean> {
  if (!Number.isFinite(expectedUpdatedAt.getTime())) return false;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: importId } });
    if (!file || file.updatedAt.getTime() !== expectedUpdatedAt.getTime() || file.status !== (options.expectedStatus ?? "done") ||
        file.confirmedAt || file.rawPurgedAt || file.confirmedTransactionsCount > 0 || file.parsedRowsCount > 0 ||
        ["non_financial", SOURCE_REVIEW_PHASE, RECEIPT_REVIEW_PHASE, "password_required", "account_match_needs_confirmation", "pause_requested", "paused", "cancel_requested", "cancelled"].includes(file.processingPhase ?? "")) return false;
    const event = await tx.auditLog.findFirst({
      where: { workspaceId: file.workspaceId, entityId: importId, action: "import.user_control" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true },
    });
    const control = (event?.metadata as { control?: string } | null)?.control;
    if (control === "paused" || control === "cancelled") return false;
    const saved = await tx.transaction.findFirst({ where: { workspaceId: file.workspaceId, OR: [
      { importFileId: importId }, { rawPayload: { path: ["sourceImportFileId"], equals: importId } },
    ] }, select: { id: true } });
    if (saved || await tx.parsedTransaction.count({ where: { importFileId: importId } }) > 0) return false;
    if (options.nextAttempt !== undefined && (!Number.isSafeInteger(options.nextAttempt) || options.nextAttempt !== file.processingAttempt + 1)) return false;
    await tx.importFile.update({ where: { id: importId }, data: {
      ...(options.nextAttempt === undefined ? {} : {processingAttempt: options.nextAttempt}),
      status: "processing", processingPhase: "queued_retry",
      processingMessage: "Clover saved this file and is restarting the background reader.",
    } });
    return true;
  });
}
