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

export const getLocalPreparseProgressPatch = (currentProgress?: number | null) => ({
  progress: Math.max(IMPORT_PROGRESS.preparing, Number(currentProgress ?? 0)),
  progressLabel: "Preparing file",
});

const getDefaultWaitingLabel = (importMode: ImportModalStatusMode, processingPhase: string | null) => {
  if (processingPhase === "queued_retry") {
    return importMode === "receipt" ? "Trying backup receipt reader" : "Trying backup reader";
  }

  if (processingPhase === "uploading") {
    return "Uploading file";
  }

  if (processingPhase === "identifying_transactions") {
    return "Identifying transactions";
  }

  if (processingPhase === "reading_receipt_vision") {
    return "Reading receipt details";
  }

  if (processingPhase === "reading_account_details") {
    return importMode === "receipt" ? "Reading receipt details" : "Reading file details";
  }

  if (processingPhase === "reconciling" || processingPhase === "staged" || processingPhase === "finalizing") {
    return "Saving transactions";
  }

  if (processingPhase === "auto_rerunning") {
    return "Rechecking file";
  }

  return importMode === "receipt" ? "Reading receipt details" : "Reading file details";
};

const getWaitingProgress = (processingPhase: string | null, progressFloor: number) => {
  if (processingPhase === "queued_retry" || processingPhase === "uploading") {
    return IMPORT_PROGRESS.uploading;
  }

  if (processingPhase === "identifying_transactions") {
    return Math.max(IMPORT_PROGRESS.loadingAccount, progressFloor);
  }

  if (processingPhase === "reading_account_details" || processingPhase === "reading_receipt_vision") {
    return Math.max(IMPORT_PROGRESS.reading, progressFloor);
  }

  if (processingPhase === "reconciling" || processingPhase === "staged" || processingPhase === "finalizing") {
    return IMPORT_PROGRESS.finalizing;
  }

  return Math.max(IMPORT_PROGRESS.parsing, progressFloor);
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

  const progressFloor = Math.max(IMPORT_PROGRESS.preparing, Number(params.progressFloor ?? IMPORT_PROGRESS.preparing) || 0);
  const progress = Math.min(IMPORT_PROGRESS.finalizing, getWaitingProgress(processingPhase, progressFloor));

  return {
    kind: "waiting",
    progress,
    // Telemetry may change several times during one parser phase. Keep the
    // visible label tied to the durable phase so a percentage has one meaning.
    progressLabel: getDefaultWaitingLabel(params.importMode, processingPhase),
    detail:
      cleanLabel(params.telemetryMessage) ??
      cleanLabel(params.processingMessage) ??
      getDefaultWaitingDetail(params.importMode, processingPhase),
  };
};
