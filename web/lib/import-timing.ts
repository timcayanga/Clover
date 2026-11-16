import { AsyncLocalStorage } from "node:async_hooks";

const readerTimingImportId = new AsyncLocalStorage<string>();
const attemptTiming = new AsyncLocalStorage<{ importFileId: string; attemptId: string; durations: Record<string, number>; work: Partial<Record<ImportWork, number>>; pdfModelUsage?: PdfModelUsage }>();
export function withImportTimingAttempt<T>(importFileId: string, attemptId: string, run: () => T): T {
  return attemptTiming.run({ importFileId, attemptId, durations: {}, work: {} }, run);
}

export function recordImportStageDuration(importFileId: string, stage: string, durationMs: number) {
  const context = attemptTiming.getStore();
  if (context?.importFileId === importFileId && Number.isFinite(durationMs) && durationMs >= 0) {
    context.durations[stage] = (context.durations[stage] ?? 0) + durationMs;
  }
}

export function getImportStageDurations(importFileId: string) {
  const context = attemptTiming.getStore();
  return context?.importFileId === importFileId ? { ...context.durations } : {};
}

type ImportWork =
  | "source_storage_read" | "source_storage_read_skipped_request_bytes" | "source_storage_read_skipped_shared_read"
  | "text_cache_hit_memory" | "text_cache_hit_persistent" | "text_cache_hit_in_flight" | "text_cache_miss"
  | "text_extraction_skipped_preflight" | "text_extraction_skipped_device_ocr" | "text_extraction_skipped_receipt_parse"
  | "text_extraction_skipped_same_attempt" | "pdf_password_probe_skipped" | "image_preview_cache_hit"
  | "receipt_account_context_reused" | "receipt_account_context_loaded_on_demand";

export function recordImportWork(work: ImportWork, importFileId?: string) {
  const context = attemptTiming.getStore();
  const sourceId = importFileId ?? context?.importFileId ?? readerTimingImportId.getStore();
  const matchingAttempt = sourceId && context?.importFileId === sourceId ? context : undefined;
  if (matchingAttempt) matchingAttempt.work[work] = (matchingAttempt.work[work] ?? 0) + 1;
  if (sourceId) console.info("[import-work]", JSON.stringify({
    importFileId: sourceId, attemptId: matchingAttempt?.attemptId, work,
  }));
}

export function getImportWork(importFileId: string) {
  const context = attemptTiming.getStore();
  return context?.importFileId === importFileId ? { ...context.work } : {};
}

// Timing-only telemetry: never include filenames, extracted text, or financial values.
// Durations use one process's monotonic clock. Wall times are correlation anchors,
// not a license to subtract clocks from different hosts or the browser.
export function startImportTiming(importFileId: string, stage: string, correlation?: { queueJobId: string }) {
  const context = attemptTiming.getStore();
  const attemptId = context?.importFileId === importFileId ? context.attemptId : undefined;
  const spanId = crypto.randomUUID();
  const startedAt = Date.now();
  const started = performance.now();
  let finished = false;
  const emit = (event: string, extra: Record<string, unknown> = {}) => {
    console.info("[import-timing]", JSON.stringify({
      version: 1, importFileId, attemptId, spanId, stage, event, startedAt, ...correlation, ...extra,
    }));
  };
  emit("started");
  return (outcome: "completed" | "failed" | "skipped" | "cancelled" = "completed", reason?: string, claimedAttemptId?: string) => {
    if (finished) return;
    finished = true;
    const durationMs = performance.now() - started;
    if (outcome !== "skipped") recordImportStageDuration(
      importFileId, outcome === "cancelled" ? `${stage}_cancelled` : stage, durationMs
    );
    emit("finished", {
      outcome, ...(reason ? { reason } : {}),
      ...(claimedAttemptId ? { attemptId: claimedAttemptId } : {}),
      endedAt: Date.now(), durationMs,
    });
  };
}

export async function measureImportTiming<T>(importFileId: string, stage: string, run: () => T | Promise<T>): Promise<T> {
  const finish = startImportTiming(importFileId, stage);
  try {
    const value = await readerTimingImportId.run(importFileId, run);
    finish();
    return value;
  } catch (error) {
    finish("failed");
    throw error;
  }
}

export function recordImportReaderTiming(stage: string, durationMs: number, outcome: "completed" | "failed" | "warm" = "completed") {
  const context = attemptTiming.getStore();
  if (context) recordImportStageDuration(context.importFileId, stage, durationMs);
  console.info("[import-reader-timing]", JSON.stringify({
    importFileId: context?.importFileId ?? readerTimingImportId.getStore(), attemptId: context?.attemptId, stage, durationMs, outcome,
  }));
}

export async function measureImportReader<T>(stage: string, run: () => T | Promise<T>) {
  const started = performance.now();
  try {
    const result = await run();
    recordImportReaderTiming(stage, performance.now() - started);
    return result;
  } catch (error) {
    recordImportReaderTiming(stage, performance.now() - started, "failed");
    throw error;
  }
}

export function reportImportReaderEvent(event: string, properties: Record<string, unknown>) {
  const context = attemptTiming.getStore();
  console.info(event, JSON.stringify({
    importFileId: context?.importFileId ?? readerTimingImportId.getStore(),
    attemptId: context?.attemptId, ...properties,
  }));
}


type PdfModelUsage = { callsWithReportedUsage: number; inputTokens: number; outputTokens: number; totalTokens: number; slowestCallMs?: number };

export function recordPdfModelUsage(importFileId: string, usage: {
  inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number | null;
}) {
  const context = attemptTiming.getStore();
  if (context?.importFileId !== importFileId) return;
  const totals = context.pdfModelUsage ??= { callsWithReportedUsage: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  totals.callsWithReportedUsage++;
  totals.inputTokens += usage.inputTokens;
  totals.outputTokens += usage.outputTokens;
  totals.totalTokens += usage.totalTokens;
  if (usage.durationMs !== null) totals.slowestCallMs = Math.max(totals.slowestCallMs ?? 0, usage.durationMs);
}

export function getPdfModelUsage(importFileId: string) {
  const context = attemptTiming.getStore();
  return context?.importFileId === importFileId ? context.pdfModelUsage : undefined;
}
