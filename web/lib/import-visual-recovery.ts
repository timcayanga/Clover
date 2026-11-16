import type { ImportDocumentVerdict } from "./import-document-verdict";
import type { ImageQualityIssue } from "./import-image-quality";
import { hasCompleteReceiptCore } from "./receipt-intake";

type VisualRequest = {
  model: string;
  detail: string;
  focus?: string;
  pages: ReadonlyArray<{ page: number; dataUrl: string }>;
};

export const repeatsVisualRequest = (attempts: readonly VisualRequest[], candidate: VisualRequest) =>
  candidate.pages.length > 0 && attempts.some(attempt =>
    attempt.model === candidate.model && attempt.detail === candidate.detail && attempt.focus === candidate.focus &&
    attempt.pages.length === candidate.pages.length &&
    attempt.pages.every((page, index) =>
      page.page === candidate.pages[index]?.page && page.dataUrl === candidate.pages[index]?.dataUrl));

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

export const shouldProcessReceiptInline = (params: { forceInlineProcessing: boolean }) =>
  params.forceInlineProcessing;

export const shouldUseReceiptPreviewFastPath = (params: {
  receiptPreviewIsUsable: boolean;
  transactionDate?: string | null;
  total?: number | string | null;
  merchant?: string | null;
}) =>
  params.receiptPreviewIsUsable &&
  Boolean(String(params.transactionDate ?? "").trim()) &&
  Number.isFinite(Number(params.total)) &&
  Number(params.total) > 0 &&
  Boolean(String(params.merchant ?? "").trim());

export const shouldLoadReceiptVisionAssets = (params: {
  imageImport: boolean;
  importMode?: string | null;
  hasTrainedReceiptDetails: boolean;
  receiptPreviewIsUsable: boolean;
  skipVisualBackupParser: boolean;
}) =>
  params.imageImport &&
  params.importMode === "receipt" &&
  !params.hasTrainedReceiptDetails &&
  !params.receiptPreviewIsUsable &&
  !params.skipVisualBackupParser;

// A first visual result can supply the receipt transaction without a separate
// transcription. The worker still checks settlement and confirms the import.
export function canReuseVisualReceiptCore(params: {
  verdict?: ImportDocumentVerdict;
  schemaValidated?: boolean;
  receiptDetails?: Parameters<typeof hasCompleteReceiptCore>[0] | null;
  imageQuality?: ImageQualityIssue[];
  validationIssues?: readonly string[];
}) {
  return params.schemaValidated === true &&
    params.verdict?.documentType === "receipt" &&
    params.verdict.evidence.length > 0 &&
    params.validationIssues?.length === 0 &&
    !params.imageQuality?.some(issue => issue.blocked_fields.some(field =>
      field === "merchant" || field === "date" || field === "total")) &&
    Boolean(params.receiptDetails && hasCompleteReceiptCore(params.receiptDetails));
}

export const shouldRetryReceiptVisionExtraction = (params: {
  hasReceiptDetails: boolean;
  qualityScore?: number | null;
  detailSignalCount: number;
}) =>
  !params.hasReceiptDetails ||
  (params.detailSignalCount < 2 && Number(params.qualityScore ?? 0) < 2);

export const shouldKeepFailedVisualImportRecoverable = (params: {
  importMode?: VisualImportRecoveryMode | null;
  isVisualImport?: boolean;
  processingAttempt: unknown;
}) =>
  params.isVisualImport === true &&
  (params.importMode === "receipt" || params.importMode === "statement") &&
  canQueueVisualImportRetry(params.processingAttempt);
