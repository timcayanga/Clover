export type ImportTelemetryPhase =
  | "queued"
  | "uploading"
  | "reading_account_details"
  | "identifying_transactions"
  | "reconciling"
  | "staged"
  | "complete"
  | "repair_needed"
  | "failed";

export type ImportTelemetrySnapshot = {
  phase: ImportTelemetryPhase;
  phaseLabel: string;
  message: string;
  canResume: boolean;
  resumeReason: string | null;
};

type ImportTelemetryParams = {
  status?: string | null;
  workflowStage?: string | null;
  processingPhase?: string | null;
  processingMessage?: string | null;
  parsedRowsCount?: number | null;
  confirmedTransactionsCount?: number | null;
  confirmationStatus?: string | null;
  checkpointStatus?: string | null;
};

const normalizePhase = (phase?: string | null): ImportTelemetryPhase | null => {
  switch ((phase ?? "").trim()) {
    case "queued":
    case "queued_retry":
      return "queued";
    case "uploading":
      return "uploading";
    case "parsing":
    case "reading_statement":
    case "reading_account":
    case "reading_account_details":
      return "reading_account_details";
    case "auto_rerunning":
    case "matching_transactions":
    case "loading_transactions":
    case "identifying_transactions":
      return "identifying_transactions";
    case "staged":
    case "reconciling":
    case "confirming":
      return "reconciling";
    case "complete":
    case "done":
    case "finalizing_enrichment":
      return "complete";
    case "plateaued":
    case "needs_retry":
    case "repairing":
      return "repair_needed";
    case "failed":
      return "failed";
    default:
      return null;
  }
};

const phaseLabelMap: Record<ImportTelemetryPhase, string> = {
  queued: "Queued",
  uploading: "Uploading file",
  reading_account_details: "Reading account details",
  identifying_transactions: "Identifying transactions",
  reconciling: "Reconciling and saving",
  staged: "Reconciling and saving",
  complete: "Import complete",
  repair_needed: "Repair needed",
  failed: "Import failed",
};

const phaseMessageMap: Record<ImportTelemetryPhase, string> = {
  queued: "Clover is waiting to start",
  uploading: "Clover is sending the file to the server",
  reading_account_details: "Clover is extracting the account name, number, and balance",
  identifying_transactions: "Clover is finding transactions and categories",
  reconciling: "Clover is matching transactions, categories, and duplicates",
  staged: "Clover found the account details and is still finishing the rest",
  complete: "The file is imported and ready",
  repair_needed: "Clover needs another pass to finish this import",
  failed: "Clover couldn't finish the import",
};

const GENERIC_PROGRESS_MESSAGES = new Set([
  "parsing file...",
  "parsing file",
  "reading account details...",
  "reading account details",
  "identifying transactions...",
  "identifying transactions",
  "clover is sending the file to the server",
  "uploading file...",
  "uploading file",
]);

export const buildImportTelemetrySnapshot = (params: ImportTelemetryParams): ImportTelemetrySnapshot => {
  const parsedRowsCount = Number(params.parsedRowsCount ?? 0);
  const confirmedTransactionsCount = Number(params.confirmedTransactionsCount ?? 0);
  const status = (params.status ?? "").trim();
  const workflowStage = normalizePhase(params.workflowStage);
  const processingPhase = normalizePhase(params.processingPhase);
  const confirmationStatus = (params.confirmationStatus ?? "").trim();
  const checkpointStatus = (params.checkpointStatus ?? "").trim();

  let phase: ImportTelemetryPhase =
    workflowStage ??
    processingPhase ??
    (status === "queued"
      ? "queued"
      : status === "processing"
        ? parsedRowsCount > 0 || confirmationStatus === "staged" || checkpointStatus === "reconciled"
          ? "reconciling"
          : "reading_account_details"
        : status === "done"
          ? confirmedTransactionsCount > 0 || checkpointStatus === "reconciled"
            ? "complete"
            : parsedRowsCount > 0
              ? "staged"
              : "complete"
          : status === "failed"
            ? parsedRowsCount > 0 || confirmedTransactionsCount > 0 || checkpointStatus
              ? "repair_needed"
              : "failed"
            : "reading_account_details");

  if (phase === "reading_account_details" && confirmedTransactionsCount > 0) {
    phase = "reconciling";
  }

  const canResume =
    phase === "repair_needed" ||
    status === "failed" ||
    status === "processing" ||
    confirmationStatus === "staged" ||
    parsedRowsCount > 0 ||
    confirmedTransactionsCount > 0 ||
    checkpointStatus === "reconciled";

  const rawMessage = params.processingMessage?.trim() ?? "";
  const normalizedRawMessage = rawMessage.toLowerCase();
  const shouldUsePhaseMessage =
    !rawMessage ||
    phase === "complete" ||
    phase === "repair_needed" ||
    phase === "failed" ||
    (phase === "reconciling" && GENERIC_PROGRESS_MESSAGES.has(normalizedRawMessage)) ||
    (phase === "staged" && GENERIC_PROGRESS_MESSAGES.has(normalizedRawMessage));
  const message = shouldUsePhaseMessage ? phaseMessageMap[phase] : rawMessage;

  return {
    phase,
    phaseLabel: phaseLabelMap[phase],
    message,
    canResume,
    resumeReason:
      phase === "repair_needed"
        ? "Clover has already read the file and can try finishing it again."
        : phase === "staged"
          ? "Clover has the account details and is still saving the rest."
          : phase === "failed"
            ? "The import did not finish and can be retried from the saved file."
            : null,
  };
};
