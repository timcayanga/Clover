import { readImportDispatch, type ImportDispatchSource, type ImportDispatch } from "./import-dispatch";
import { isUploadPdf } from "../../shared/native-upload";
import { getImportWork, getImportStageDurations, getPdfModelUsage, startImportTiming, withImportTimingAttempt } from "./import-timing";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { INSTITUTION_SUGGESTIONS } from "../../shared/institution-suggestions";
import { PUBLIC_IMPORT_EXTENSIONS, TRAINING_IMAGE_EXTENSIONS } from "./import-format-policies";
import { prisma } from "./prisma";
import { capturePostHogServerEvent } from "./analytics-server";
import { SOURCE_REVIEW_PHASE, SourceReviewRequiredError } from "./import-source-review";

// Independent of processingAttempt, which is the bounded visual-parser pass.
// A durable claim covers the whole operation, including its internal passes.
export const IMPORT_ATTEMPT_ACTION = "import.processing_attempt";
export const IMPORT_ATTEMPT_LEASE_MS = 10 * 60_000;
type Attempt = {
  version: 1; attemptId: string; attemptNumber: number; startedAt: string;
  uploadAcceptedAt: string; leaseExpiresAt: string; outcome: string;
  dispatchId?: string; dispatchWaitMs?: number; dispatchSource?: ImportDispatchSource;
  endedAt?: string; durationMs?: number; uploadToOutcomeMs?: number;
  uploadToTransactionAvailableMs?: number | null; phase?: string | null;
  transactionObservedAt?: string;
  firstTransactionId?: string;
  pdfFinalizationMs?: number;
  pdfFinalizationPath?: string;
  pdfByteAssemblyMs?: number;
  pdfWorkerClaimMs?: number;
  pdfClaimPoolWaitMs?: number;
  pdfClaimRowLockMs?: number;
  pdfReadyToProcessingMs?: number;
  pdfPreflightExtractionMs?: number;
  pdfQueueWaitMs?: number | null;
  pdfWorkerTextExtractionMs?: number | null;
  pdfWorkerTextPath?: "preflight_reused" | "cache_hit" | "cache_miss" | "reader_failed" | "reader_skipped";
  pdfRepeatedTextRead?: boolean;
  pdfModelExtractionMs?: number | null;
  importWork?: ReturnType<typeof getImportWork>;
  readerTimingsMs?: Record<string, number>;
  databaseWriteTimingsMs?: Record<string, number>;
  pdfModelUsage?: ReturnType<typeof getPdfModelUsage>;
  pdfTransactionSaveMs?: number | null;
  historicalAttemptsUnknown?: boolean;
};
type Claim = { importId: string; workspaceId: string; actorUserId: string | null; recordId: string; attempt: Attempt; dispatchOptions?: ImportDispatch };
const context = new AsyncLocalStorage<Claim>();
const readAttempt = (value: unknown) => {
  const a = value as Partial<Attempt> | null;
  return a?.version === 1 && typeof a.attemptId === "string" && Number.isSafeInteger(a.attemptNumber)
    ? a as Attempt : null;
};
const latest = (tx: Prisma.TransactionClient, workspaceId: string, importId: string) => tx.auditLog.findFirst({
  where: { workspaceId, entityId: importId, action: IMPORT_ATTEMPT_ACTION },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
});

const hasLiveLease = (attempt: Attempt | null, now: number) =>
  attempt?.outcome === "running" && Date.parse(attempt.leaseExpiresAt) > now;

export async function hasActiveImportAttempt(workspaceId: string, importId: string, tx: Prisma.TransactionClient = prisma) {
  return hasLiveLease(readAttempt((await latest(tx, workspaceId, importId))?.metadata), Date.now());
}

export class ImportAttemptLostError extends Error {
  constructor() { super("This import is already being handled by another attempt."); this.name = "ImportAttemptLostError"; }
}

/** No financial writes. The ImportFile lock serializes competing HTTP/queue/sweep claims. */
export async function claimImportAttempt(
  importId: string, actorUserId?: string | null, queueWaitMs: number | null = 0, queueJobId?: string,
  dispatch?: { id: string; source: ImportDispatchSource },
) {
  const correlation = queueJobId ? { queueJobId } : undefined;
  // Prisma invokes the callback only after opening the transaction. This
  // boundary includes connection acquisition and transaction startup.
  const finishPoolWait = startImportTiming(importId, "claim_pool_wait", correlation);
  const requestedAt = performance.now();
  let enteredAt: number | undefined;
  let finishClaim: ReturnType<typeof startImportTiming> | undefined;
  const claim = await prisma.$transaction(async tx => {
    enteredAt = performance.now();
    finishPoolWait();
    finishClaim = startImportTiming(importId, "worker_claim", correlation);
    const lockStartedAt = performance.now();
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const claimRowLockMs = performance.now() - lockStartedAt;
    const file = await tx.importFile.findUniqueOrThrow({ where: { id: importId } });
    if (file.processingPhase === "non_financial") return null;
    if (file.processingPhase === SOURCE_REVIEW_PHASE && file.confirmedTransactionsCount === 0) {
      throw new SourceReviewRequiredError(file.processingMessage ?? "This source needs review before it can be processed again.", true);
    }
    const prior = await latest(tx, file.workspaceId, importId);
    const previous = readAttempt(prior?.metadata);
    const completedOperation = file.confirmedAt !== null;
    if (completedOperation) {
      // A second request may have begun upload preparation before the first
      // committed. Reuse the completed operation even if that late preparation
      // rewrote cosmetic status. Never reparse or recreate deleted finance.
      if (file.status !== "done" || file.processingPhase !== "complete") {
        await tx.importFile.update({ where: { id: importId }, data: {
          status: "done", processingPhase: "complete", processingMessage: "This import is already complete.",
        } });
      }
      return null;
    }
    const legacy = !prior && (file.status !== "processing" || file.parsedRowsCount > 0 || file.confirmedAt !== null ||
      Boolean(await tx.auditLog.findFirst({ where: { workspaceId: file.workspaceId, entityId: importId, action: "import.parser_usage" }, select: { id: true } })));
    const now = new Date();
    if (hasLiveLease(previous, now.getTime())) return null;
    const pendingDispatch = file.status === "processing" || dispatch
      ? await readImportDispatch(tx, importId, file.workspaceId) : null;
    if (dispatch && (pendingDispatch?.data.id !== dispatch.id || pendingDispatch.data.claimedAt ||
        file.status !== "processing" || file.rawPurgedAt ||
        ["paused", "pause_requested", "cancelled", "cancel_requested"].includes(file.processingPhase ?? ""))) return null;
    const claimedDispatch = pendingDispatch && !pendingDispatch.data.claimedAt ? pendingDispatch : null;
    if (claimedDispatch) await tx.auditLog.update({ where: { id: claimedDispatch.row.id }, data: {
      metadata: { ...claimedDispatch.data, claimedAt: now.toISOString() },
    } });
    // An abandoned invocation is a failed attempt, not an invisible success or
    // a fresh first attempt. Preserve its original timing anchors and identity.
    if (prior && previous?.outcome === "running") await tx.auditLog.update({ where: { id: prior.id }, data: { metadata: {
      ...previous, outcome: "interrupted", endedAt: now.toISOString(),
      durationMs: Math.max(0, now.getTime() - Date.parse(previous.startedAt)),
      uploadToOutcomeMs: Math.max(0, now.getTime() - Date.parse(previous.uploadAcceptedAt)),
    } } });
    const pdf = isUploadPdf(file.fileName, file.fileType);
    const pdfStages = pdf ? await tx.auditLog.findMany({
      where: { workspaceId: file.workspaceId, entityId: importId, action: { in: ["import.pdf_transport_ready", "import.pdf_preflight_timing"] },
        ...(previous ? { createdAt: { gt: new Date(previous.startedAt) } } : {}) },
      orderBy: { createdAt: "desc" }, select: { createdAt: true, action: true, metadata: true }, take: 4,
    }) : [];
    const transport = pdfStages.find(stage => stage.action === "import.pdf_transport_ready");
    const preflight = pdfStages.find(stage => stage.action === "import.pdf_preflight_timing");
    const preflightMs = (preflight?.metadata as { elapsedMs?: unknown } | null)?.elapsedMs;
    const transportTiming = transport?.metadata as { pdfFinalizationMs?: unknown; pdfByteAssemblyMs?: unknown; path?: string } | null;
    const pdfFinalizationMs = transportTiming?.pdfFinalizationMs;
    const attempt: Attempt = { version: 1, attemptId: crypto.randomUUID(), attemptNumber: (previous?.attemptNumber ?? 0) + 1,
      startedAt: now.toISOString(), uploadAcceptedAt: file.uploadedAt.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + IMPORT_ATTEMPT_LEASE_MS).toISOString(), outcome: "running",
      historicalAttemptsUnknown: previous?.historicalAttemptsUnknown ?? legacy,
      ...(claimedDispatch ? {
        dispatchId: claimedDispatch.data.id,
        dispatchWaitMs: Math.max(0, +now - Date.parse(claimedDispatch.data.queuedAt)),
        dispatchSource: dispatch?.source ?? "resume",
      } : {}),
      ...(pdf ? {
        pdfQueueWaitMs: claimedDispatch ? Math.max(0, +now - Date.parse(claimedDispatch.data.queuedAt)) : queueWaitMs,
        pdfClaimPoolWaitMs: enteredAt - requestedAt,
        pdfClaimRowLockMs: claimRowLockMs,
      } : {}),
      ...(typeof preflightMs === "number" ? { pdfPreflightExtractionMs: preflightMs } : {}),
      ...(transport && typeof pdfFinalizationMs === "number" ? {
        pdfFinalizationMs,
        ...(typeof transportTiming?.pdfByteAssemblyMs === "number" ? { pdfByteAssemblyMs: transportTiming.pdfByteAssemblyMs } : {}),
        ...(transportTiming?.path ? { pdfFinalizationPath: transportTiming.path } : {}),
        pdfReadyToProcessingMs: Math.max(0, +now - +transport.createdAt),
      } : {}),
    };
    const owner = actorUserId ? null : await tx.workspace.findUnique({ where: { id: file.workspaceId }, select: { user: { select: { clerkUserId: true } } } });
    const record = await tx.auditLog.create({ data: { id: `import-attempt-${importId}-${String(attempt.attemptNumber).padStart(9, "0")}`,
      workspaceId: file.workspaceId, actorUserId: actorUserId ?? "system",
      action: IMPORT_ATTEMPT_ACTION, entity: "ImportFile", entityId: importId, metadata: attempt } });
    return { importId, workspaceId: file.workspaceId, actorUserId: actorUserId ?? owner?.user.clerkUserId ?? null, recordId: record.id, attempt, dispatchOptions: claimedDispatch?.data } satisfies Claim;
  }).catch(error => {
    if (finishClaim) finishClaim("failed");
    else finishPoolWait("failed");
    throw error;
  });
  const claimFinishedAt = performance.now();
  finishClaim?.("completed", claim ? "claimed" : "not_claimed", claim?.attempt.attemptId);
  if (claim?.attempt.pdfClaimPoolWaitMs !== undefined && enteredAt !== undefined) {
    claim.attempt.pdfWorkerClaimMs = claimFinishedAt - enteredAt;
  }
  return claim;
}

export async function getImportVisibilityTarget(workspaceId: string, importId: string) {
  const attempt = readAttempt((await latest(prisma, workspaceId, importId))?.metadata);
  return attempt?.firstTransactionId
    ? { attemptId: attempt.attemptId, transactionId: attempt.firstTransactionId }
    : null;
}

export function currentImportAttempt(importId: string) {
  const claim = context.getStore();
  return claim?.importId === importId ? claim : null;
}
export const withImportAttempt = <T>(claim: Claim, run: () => Promise<T>) => context.run(claim, () => withImportTimingAttempt(claim.importId, claim.attempt.attemptId, run));

/** Also called while holding the confirmation row lock, so a superseded run cannot commit. */
export async function assertImportAttemptCurrent(importId: string, tx?: Prisma.TransactionClient) {
  const claim = currentImportAttempt(importId);
  if (!claim) return; // Ordinary user confirmation is not a parser invocation.
  const record = await latest(tx ?? prisma, claim.workspaceId, importId);
  const attempt = readAttempt(record?.metadata);
  if (record?.id !== claim.recordId || attempt?.outcome !== "running" || Date.parse(attempt.leaseExpiresAt) <= Date.now()) {
    throw new ImportAttemptLostError();
  }
}

export async function finishImportAttempt(claim: Claim, threw: boolean, rejectionMessage?: string) {
  const durations = getImportStageDurations(claim.importId);
  const importWork = getImportWork(claim.importId);
  const pdfModelUsage = getPdfModelUsage(claim.importId);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${claim.importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: claim.importId }, include: { account: { select: { institution: true } } } });
    if (!file) return null;
    const record = await tx.auditLog.findUnique({ where: { id: claim.recordId } });
    const previous = readAttempt(record?.metadata);
    if (!previous || previous.outcome !== "running") return null;
    // Include legacy and soft-deleted links: deleted successful data must not
    // be misreported as a failure, nor resurrected to satisfy this measurement.
    const saved = await tx.transaction.findFirst({ where: { workspaceId: file.workspaceId, OR: [
      { importFileId: file.id }, { rawPayload: { path: ["sourceImportFileId"], equals: file.id } },
    ] }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const now = new Date();
    let phase = file.processingPhase;
    if (rejectionMessage && !saved && !file.confirmedAt && !file.confirmedTransactionsCount && !file.parsedRowsCount &&
        !["pause_requested", "paused", "cancel_requested", "cancelled"].includes(phase ?? "")) {
      // Publish the rejection in the same transaction that releases the lease.
      await tx.importFile.update({ where: { id: file.id }, data: {
        status: "failed", processingPhase: "non_financial", processingMessage: rejectionMessage,
      } });
      phase = "non_financial";
    }
    const outcome = saved ? "transaction_available"
      : phase === "cancelled" || phase === "cancel_requested" ? "cancelled"
      : phase === "paused" || phase === "pause_requested" ? "paused"
      : ["source_review_required", "receipt_review_required", "payment_account_review_required", "account_match_needs_confirmation", "password_required"].includes(phase ?? "") ? "input_required"
      : file.status === "done" ? "completed_without_transaction"
      : threw || file.status === "failed" ? "failed" : "pending";
    const pdfWorkerTextPath: Attempt["pdfWorkerTextPath"] =
      durations.pdf_preflight_reused !== undefined ? "preflight_reused" :
      durations.pdf_worker_text_cache_hit !== undefined ? "cache_hit" :
      durations.pdf_worker_text_cache_miss !== undefined ? "cache_miss" :
      durations.pdf_worker_reader_started !== undefined ? "reader_failed" : "reader_skipped";
    const readerTimingsMs = Object.fromEntries(Object.entries(durations).filter(([stage]) =>
      /^(?:pdf_(?:text|render)|ocr)_(?:slot_wait|worker_cold_start|worker_reuse|document_open|work|recognition)$/.test(stage),
    ));
    const databaseWriteTimingsMs = Object.fromEntries(Object.entries(durations).filter(([stage]) =>
      /^(?:candidate_(?:persistence|pool_wait|import_row_lock|row_writes)|confirmation_(?:pool_wait|import_row_lock|quota_lock|statement_lock|row_writes)|normalized_transaction_commit)$/.test(stage),
    ));
    const biggestReceiptStage = ["text_extraction", "model_extraction_and_parse", "candidate_persistence", "receipt_core_persistence"]
      .filter(stage => durations[stage] !== undefined)
      .sort((left, right) => durations[right] - durations[left])[0];
    const receiptBreakdown = {
      receipt_route: Object.keys(durations).find(key => key.startsWith("receipt_route_"))?.slice("receipt_route_".length),
      receipt_ocr_quality: Object.keys(durations).find(key => key.startsWith("receipt_ocr_"))?.slice("receipt_ocr_".length),
      receipt_slowest_server_stage: biggestReceiptStage,
      receipt_slowest_server_stage_ms: biggestReceiptStage ? durations[biggestReceiptStage] : undefined,
    };
    const attempt: Attempt = { ...previous, outcome, phase,
      ...(Object.keys(importWork).length ? { importWork } : {}),
      ...(Object.keys(readerTimingsMs).length ? { readerTimingsMs } : {}),
      ...(Object.keys(databaseWriteTimingsMs).length ? { databaseWriteTimingsMs } : {}), endedAt: now.toISOString(),
      durationMs: Math.max(0, now.getTime() - Date.parse(previous.startedAt)),
      uploadToOutcomeMs: Math.max(0, now.getTime() - Date.parse(previous.uploadAcceptedAt)),
      ...(isUploadPdf(file.fileName, file.fileType) ? {
        pdfWorkerClaimMs: claim.attempt.pdfWorkerClaimMs,
        pdfWorkerTextExtractionMs: durations.text_extraction ?? null,
        pdfWorkerTextPath,
        pdfRepeatedTextRead: previous.pdfPreflightExtractionMs !== undefined &&
          durations.pdf_worker_reader_started !== undefined,
        pdfModelExtractionMs: durations.model_extraction_and_parse ?? null,
        ...(pdfModelUsage ? { pdfModelUsage } : {}),
        pdfTransactionSaveMs: previous.pdfTransactionSaveMs ?? durations.transaction_save ?? null,
      } : {}),
      // createdAt is set inside a transaction, before its commit. Observe the
      // committed row here instead of presenting that earlier clock as a save.
      ...(saved ? { transactionObservedAt: previous.transactionObservedAt ?? now.toISOString(), firstTransactionId: previous.firstTransactionId ?? saved.id } : {}),
      uploadToTransactionAvailableMs: saved ? previous.uploadToTransactionAvailableMs ?? Math.max(0, now.getTime() - Date.parse(previous.uploadAcceptedAt)) : null };
    await tx.auditLog.update({ where: { id: record!.id }, data: { metadata: attempt } });
    const institution = file.account?.institution?.trim().toLowerCase();
    const institutionLabel = institution ? INSTITUTION_SUGGESTIONS.find(candidate =>
      candidate.label.toLowerCase() === institution || candidate.aliases.some(alias => alias.toLowerCase() === institution),
    )?.label : undefined;
    const extension = /\.([a-z0-9]{1,8})$/i.exec(file.fileName.trim())?.[0].toLowerCase() ?? "";
    const image = /^image\//i.test(file.fileType) || (extension !== ".pdf" && TRAINING_IMAGE_EXTENSIONS.some(value => value === extension));
    const format = image ? "image" : PUBLIC_IMPORT_EXTENSIONS.some(value => value === extension)
      ? extension.slice(1)
      : file.fileType === "application/pdf" ? "pdf" : "other";
    return { attempt, format, institution: institutionLabel ?? "unknown", receiptBreakdown };
  });
  if (result && claim.actorUserId) await capturePostHogServerEvent("import_attempt_finished", claim.actorUserId, {
    measurement_version: result.format === "pdf" ? 4 : 2, import_format: result.format, import_institution: result.institution, import_file_id: claim.importId, workspace_id: claim.workspaceId,
    attempt_id: result.attempt.attemptId, attempt_number: result.attempt.attemptNumber,
    first_attempt: result.attempt.attemptNumber === 1 && !result.attempt.historicalAttemptsUnknown,
    historical_attempts_unknown: result.attempt.historicalAttemptsUnknown ?? false,
    outcome: result.attempt.outcome, processing_phase: result.attempt.phase, duration_ms: result.attempt.durationMs,
    ...(result.format === "pdf" ? {
      pdf_finalization_ms: result.attempt.pdfFinalizationMs,
      pdf_finalization_path: result.attempt.pdfFinalizationPath,
      pdf_byte_assembly_ms: result.attempt.pdfByteAssemblyMs,
      pdf_worker_claim_ms: result.attempt.pdfWorkerClaimMs,
      pdf_claim_pool_wait_ms: result.attempt.pdfClaimPoolWaitMs,
      pdf_claim_row_lock_ms: result.attempt.pdfClaimRowLockMs,
      pdf_ready_to_processing_ms: result.attempt.pdfReadyToProcessingMs,
      pdf_preflight_extraction_ms: result.attempt.pdfPreflightExtractionMs,
      pdf_pre_worker_other_ms: result.attempt.pdfReadyToProcessingMs === undefined ? undefined
        : Math.max(0, result.attempt.pdfReadyToProcessingMs - (result.attempt.pdfPreflightExtractionMs ?? 0)),
      pdf_queue_wait_ms: result.attempt.pdfQueueWaitMs,
      pdf_worker_text_extraction_ms: result.attempt.pdfWorkerTextExtractionMs,
      pdf_worker_text_path: result.attempt.pdfWorkerTextPath,
      pdf_repeated_text_read: result.attempt.pdfRepeatedTextRead,
      pdf_model_extraction_ms: result.attempt.pdfModelExtractionMs,
      pdf_model_calls_with_usage: result.attempt.pdfModelUsage?.callsWithReportedUsage,
      pdf_model_input_tokens: result.attempt.pdfModelUsage?.inputTokens,
      pdf_model_output_tokens: result.attempt.pdfModelUsage?.outputTokens,
      pdf_model_total_tokens: result.attempt.pdfModelUsage?.totalTokens,
      pdf_model_slowest_call_ms: result.attempt.pdfModelUsage?.slowestCallMs,
      pdf_transaction_save_ms: result.attempt.pdfTransactionSaveMs,
    } : {}),
    ...(result.format === "image" ? result.receiptBreakdown : {}),
    ...Object.fromEntries(Object.entries(result.attempt.importWork ?? {}).map(([key, value]) => [`import_work_${key}`, value])),
    ...Object.fromEntries(Object.entries(result.attempt.readerTimingsMs ?? {}).map(([key, value]) => [`reader_${key}_ms`, value])),
    ...Object.fromEntries(Object.entries(result.attempt.databaseWriteTimingsMs ?? {}).map(([key, value]) => [`database_write_${key}_ms`, value])),
    dispatch_id: result.attempt.dispatchId,
    dispatch_wait_ms: result.attempt.dispatchWaitMs,
    dispatch_source: result.attempt.dispatchSource,
    upload_to_attempt_start_ms: Math.max(0, Date.parse(result.attempt.startedAt) - Date.parse(result.attempt.uploadAcceptedAt)),
    upload_to_outcome_ms: result.attempt.uploadToOutcomeMs, upload_to_transaction_available_ms: result.attempt.uploadToTransactionAvailableMs,
    timing_boundary: "server_upload_accepted_to_transaction_observed", // Conservative server observation, not UI rendering.
  }).catch(() => undefined);
  return result?.attempt ?? null;
}

/** Confirmation may happen after processing has returned a staged result.
 * Record that later availability separately without rewriting the first-pass
 * outcome or creating another parser attempt. */
export async function observeImportTransactionAvailability(importId: string, saveMs?: number) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: importId }, select: { workspaceId: true } });
    if (!file) return;
    const record = await latest(tx,file.workspaceId,importId);
    const attempt = readAttempt(record?.metadata);
    if (!record || !attempt || attempt.transactionObservedAt) return;
    const saved = await tx.transaction.findFirst({where:{workspaceId:file.workspaceId,OR:[
      {importFileId:importId},{rawPayload:{path:["sourceImportFileId"],equals:importId}},
    ]},select:{id:true}});
    if (!saved) return;
    const now = new Date();
    await tx.auditLog.update({where:{id:record.id},data:{metadata:{...attempt,
      ...(attempt.pdfQueueWaitMs !== undefined && saveMs !== undefined ? { pdfTransactionSaveMs: saveMs } : {}),
      firstTransactionId:saved.id,transactionObservedAt:now.toISOString(),uploadToTransactionAvailableMs:Math.max(0,+now-Date.parse(attempt.uploadAcceptedAt))}}});
  });
}
