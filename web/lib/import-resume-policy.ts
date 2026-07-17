const ACTIVE_IMPORT_PHASES = new Set([
  "reading_account_details",
  "identifying_transactions",
  "reconciling",
  "auto_rerunning",
]);

export const AUTO_RESUME_QUEUE_STALE_MS = 30_000;
export const ACTIVE_IMPORT_STALE_MS = 120_000;

const timestampAgeMs = (updatedAt: string | Date | null | undefined, now: number) => {
  const updatedAtMs = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt ?? ""));
  return Number.isFinite(updatedAtMs) ? Math.max(0, now - updatedAtMs) : null;
};

export const shouldAutoResumeQueuedImport = (params: {
  backgroundOnly: boolean;
  resumeAttempted: boolean;
  canResume: boolean;
  processingPhase: string | null;
  parsedRowsCount: number;
  confirmedTransactionsCount: number;
  updatedAt: string | null | undefined;
  now?: number;
}) => {
  const ageMs = timestampAgeMs(params.updatedAt, params.now ?? Date.now());
  return (
    !params.backgroundOnly &&
    !params.resumeAttempted &&
    params.canResume &&
    params.processingPhase === "queued_retry" &&
    params.parsedRowsCount === 0 &&
    params.confirmedTransactionsCount === 0 &&
    ageMs !== null &&
    ageMs >= AUTO_RESUME_QUEUE_STALE_MS
  );
};

export const importProcessingLooksActive = (params: {
  status: string | null | undefined;
  processingPhase: string | null | undefined;
  updatedAt: string | Date | null | undefined;
  now?: number;
}) => {
  const ageMs = timestampAgeMs(params.updatedAt, params.now ?? Date.now());
  return (
    params.status === "processing" &&
    ACTIVE_IMPORT_PHASES.has(String(params.processingPhase ?? "")) &&
    ageMs !== null &&
    ageMs < ACTIVE_IMPORT_STALE_MS
  );
};
