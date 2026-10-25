import { prisma } from "./prisma";
import { countParsedTransactionRows, countTransactionsByImportFileCompat, fetchImportFileCompat } from "./data-engine";
import { isSourceReviewRequiredError, sourceReviewFailureReason, sourceReviewUserMessage, SOURCE_REVIEW_PHASE } from "./import-source-review";

const CONTROL_PHASES = ["pause_requested", "paused", "cancel_requested", "cancelled"];

type SourceReviewDecision =
  | { kind: "review"; message: string; diagnosticReason: string; noOp: boolean }
  | { kind: "user_control"; control: "paused" | "cancelled" }
  | { kind: "unavailable" | "existing_rows" | "missing_import" };

export async function persistSourceReviewFailure(importFileId: string, error: unknown): Promise<SourceReviewDecision | null> {
  if (!isSourceReviewRequiredError(error)) return null;
  const [confirmedRows, parsedRows] = await Promise.all([
    countTransactionsByImportFileCompat(importFileId).catch(() => -1),
    countParsedTransactionRows(importFileId).catch(() => -1),
  ]);
  if (confirmedRows < 0 || parsedRows < 0) return { kind: "unavailable" };
  const reason = sourceReviewFailureReason(error, { confirmedRows, parsedRows });
  if (!reason) return { kind: "existing_rows" };
  const file = await fetchImportFileCompat(importFileId).catch(() => undefined);
  if (file === undefined) return { kind: "unavailable" };
  if (!file) return { kind: "missing_import" };
  if (CONTROL_PHASES.includes(String(file.processingPhase))) {
    return { kind: "user_control", control: String(file.processingPhase).startsWith("pause") ? "paused" : "cancelled" };
  }
  if (file.status === "done" || file.confirmedAt) return { kind: "unavailable" };
  const message = sourceReviewUserMessage(reason);
  if (file.status === "failed" && file.processingPhase === SOURCE_REVIEW_PHASE && file.processingMessage === message &&
      file.processingCurrentScore === 0 && file.parsedRowsCount === 0 && file.confirmedTransactionsCount === 0) {
    return { kind: "review", message, diagnosticReason: reason, noOp: true };
  }
  const updatedAt = file.updatedAt instanceof Date ? file.updatedAt : new Date(String(file.updatedAt));
  if (!Number.isFinite(updatedAt.getTime())) return { kind: "unavailable" };
  // Atomic predicates protect rows committed after the counts above, and a
  // concurrent source/progress change wins instead of being overwritten.
  const updated = await prisma.importFile.updateMany({
    where: { id: importFileId, updatedAt, status: { not: "done" }, confirmedAt: null,
      OR: [{ processingPhase: null }, { processingPhase: { notIn: CONTROL_PHASES } }],
      parsedRowsCount: 0, confirmedTransactionsCount: 0,
      transactions: { none: {} }, parsedRows: { none: {} } },
    data: { status: "failed", processingPhase: SOURCE_REVIEW_PHASE, processingMessage: message,
      processingCurrentScore: 0, parsedRowsCount: 0, confirmedTransactionsCount: 0 },
  }).catch(() => null);
  return updated?.count === 1
    ? { kind: "review", message, diagnosticReason: reason, noOp: false }
    : { kind: "unavailable" };
}
