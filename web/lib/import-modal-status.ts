import { IMPORT_PROGRESS } from "@/lib/import-progress";

export type ImportModalStatusMode = "receipt" | "statement" | "portfolio" | "account_detail" | "notes";

export type ImportModalStatusDecision =
  | {
      kind: "visible";
      progress: number;
      progressLabel: string;
      detail: string;
    }
  | {
      kind: "repair_needed";
      progress: number;
      progressLabel: string;
      errorCode: "I-104";
      message: string;
    }
  | {
      kind: "waiting";
      progress: number;
      progressLabel: string;
      detail: string;
    };

const toCount = (value: unknown) => {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
};

const cleanLabel = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const getDefaultWaitingLabel = (importMode: ImportModalStatusMode, processingPhase: string | null) => {
  if (processingPhase === "queued_retry") {
    return importMode === "receipt" ? "Queued for receipt retry" : "Queued for backup reading";
  }

  if (processingPhase === "identifying_transactions") {
    return "Reading transactions";
  }

  if (processingPhase === "reading_receipt_vision") {
    return "Reading receipt";
  }

  if (processingPhase === "reading_account_details") {
    return importMode === "receipt" ? "Reading receipt details" : "Reading file details";
  }

  return importMode === "receipt" ? "Reading receipt in background" : "Reading document in background";
};

const getDefaultWaitingDetail = (importMode: ImportModalStatusMode, processingPhase: string | null) => {
  if (processingPhase === "queued_retry") {
    return importMode === "receipt"
      ? "Clover is running the backup receipt reader."
      : "Clover is running the backup image reader.";
  }

  if (processingPhase === "auto_rerunning") {
    return "Clover is rechecking the document.";
  }

  return importMode === "receipt"
    ? "Clover is extracting the receipt details."
    : "Clover is extracting the file details.";
};

export const resolveImportModalStatusDecision = (params: {
  importMode: ImportModalStatusMode;
  status?: string | null;
  processingPhase?: string | null;
  processingMessage?: string | null;
  telemetryPhase?: string | null;
  telemetryLabel?: string | null;
  telemetryMessage?: string | null;
  parsedRowsCount?: number | null;
  confirmedTransactionsCount?: number | null;
  visibleImportComplete?: boolean | null;
  hasStructuredReceiptVisibility?: boolean | null;
  processingAttempt?: number | null;
  progressFloor?: number | null;
}): ImportModalStatusDecision => {
  const parsedRowsCount = toCount(params.parsedRowsCount);
  const confirmedTransactionsCount = toCount(params.confirmedTransactionsCount);
  const processingPhase = cleanLabel(params.processingPhase);
  const visible =
    Boolean(params.visibleImportComplete) ||
    Boolean(params.hasStructuredReceiptVisibility) ||
    parsedRowsCount > 0 ||
    confirmedTransactionsCount > 0;

  if (visible) {
    const rowCount = Math.max(parsedRowsCount, confirmedTransactionsCount);
    return {
      kind: "visible",
      progress: 100,
      progressLabel: "Visible in Clover",
      detail:
        rowCount > 0
          ? `Clover found ${rowCount.toLocaleString("en-US")} item${rowCount === 1 ? "" : "s"}.`
          : "The file is visible in Clover.",
    };
  }

  const repairMessage = cleanLabel(params.processingMessage) ?? cleanLabel(params.telemetryMessage);
  if (params.status === "failed" || params.telemetryPhase === "repair_needed" || processingPhase === "repair_needed") {
    return {
      kind: "repair_needed",
      progress: Math.min(params.progressFloor ?? IMPORT_PROGRESS.finalizing, IMPORT_PROGRESS.finalizing),
      progressLabel: "Review needed",
      errorCode: "I-104",
      message:
        repairMessage ??
        (params.importMode === "receipt"
          ? "Clover could not finish reading this receipt. Please retry with a clearer photo or a different angle."
          : "Clover could not finish reading this file. Please retry with a clearer file or a different angle."),
    };
  }

  const attemptProgress = Math.max(0, Number(params.processingAttempt ?? 0) || 0);
  const progressFloor = Math.max(IMPORT_PROGRESS.parsing, Number(params.progressFloor ?? IMPORT_PROGRESS.parsing) || 0);
  const progress =
    processingPhase === "queued_retry"
      ? Math.max(IMPORT_PROGRESS.uploading, Math.min(90, IMPORT_PROGRESS.uploading + attemptProgress))
      : Math.max(progressFloor, Math.min(90, progressFloor + attemptProgress));

  return {
    kind: "waiting",
    progress,
    progressLabel:
      cleanLabel(params.telemetryLabel) ??
      cleanLabel(params.processingMessage) ??
      getDefaultWaitingLabel(params.importMode, processingPhase),
    detail:
      cleanLabel(params.telemetryMessage) ??
      cleanLabel(params.processingMessage) ??
      getDefaultWaitingDetail(params.importMode, processingPhase),
  };
};
