export type VisualImportRecoveryMode = "receipt" | "statement";

export const VISUAL_IMPORT_RETRY_LIMIT = 3;

export const coerceVisualImportAttempt = (value: unknown) => {
  const attempt = Number(value ?? 0);
  return Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
};

export const getVisualImportRetryMessage = (importMode: VisualImportRecoveryMode, attempt: number) =>
  importMode === "receipt"
    ? `Clover hit a temporary receipt-reading issue and queued backup pass ${attempt}/${VISUAL_IMPORT_RETRY_LIMIT}.`
    : `Clover hit a temporary image-reading issue and queued backup pass ${attempt}/${VISUAL_IMPORT_RETRY_LIMIT}.`;

export const getVisualImportRepairMessage = (importMode: VisualImportRecoveryMode) =>
  importMode === "receipt"
    ? "Clover tried the local and backup receipt readers but still could not extract enough reliable details. Please retry with a clearer photo or a different angle."
    : "Clover tried the local and backup image readers but still could not extract enough reliable details. Please retry with a clearer file or a different angle.";

export const getNextVisualImportAttempt = (value: unknown) => coerceVisualImportAttempt(value) + 1;

export const canQueueVisualImportRetry = (value: unknown) =>
  getNextVisualImportAttempt(value) <= VISUAL_IMPORT_RETRY_LIMIT;

export const isVisualImportRetryBudgetExhausted = (value: unknown) =>
  coerceVisualImportAttempt(value) >= VISUAL_IMPORT_RETRY_LIMIT;

export const shouldStopStaleVisualImportRetry = (params: {
  processingAttempt: unknown;
  processingPhase?: string | null;
}) =>
  isVisualImportRetryBudgetExhausted(params.processingAttempt) && params.processingPhase !== "queued_retry";

export const shouldQueueDifficultVisualImportInsteadOfFailing = (params: {
  knownDifficultVisualImport?: boolean;
  forceInlineProcessing?: boolean;
  canReuseCachedParseSnapshot?: boolean;
}) =>
  params.knownDifficultVisualImport === true &&
  params.forceInlineProcessing !== true &&
  params.canReuseCachedParseSnapshot !== true;
