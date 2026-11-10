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
  endedAt?: string; durationMs?: number; uploadToOutcomeMs?: number;
  uploadToTransactionAvailableMs?: number | null; phase?: string | null;
  transactionObservedAt?: string;
  historicalAttemptsUnknown?: boolean;
};
type Claim = { importId: string; workspaceId: string; actorUserId: string | null; recordId: string; attempt: Attempt };
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

export class ImportAttemptLostError extends Error {
  constructor() { super("This import is already being handled by another attempt."); this.name = "ImportAttemptLostError"; }
}

/** No financial writes. The ImportFile lock serializes competing HTTP/queue/sweep claims. */
export async function claimImportAttempt(importId: string, actorUserId?: string | null) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const file = await tx.importFile.findUniqueOrThrow({ where: { id: importId } });
    if (file.processingPhase === SOURCE_REVIEW_PHASE && file.parsedRowsCount === 0 && file.confirmedTransactionsCount === 0) {
      throw new SourceReviewRequiredError(file.processingMessage ?? "This source needs review before it can be processed again.");
    }
    const prior = await latest(tx, file.workspaceId, importId);
    const previous = readAttempt(prior?.metadata);
    const completedOperation = previous?.phase === "complete" && file.confirmedAt !== null &&
      (previous.outcome === "transaction_available" || previous.outcome === "completed_without_transaction");
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
    if (previous?.outcome === "running" && Date.parse(previous.leaseExpiresAt) > now.getTime()) return null;
    // An abandoned invocation is a failed attempt, not an invisible success or
    // a fresh first attempt. Preserve its original timing anchors and identity.
    if (prior && previous?.outcome === "running") await tx.auditLog.update({ where: { id: prior.id }, data: { metadata: {
      ...previous, outcome: "interrupted", endedAt: now.toISOString(),
      durationMs: Math.max(0, now.getTime() - Date.parse(previous.startedAt)),
      uploadToOutcomeMs: Math.max(0, now.getTime() - Date.parse(previous.uploadAcceptedAt)),
    } } });
    const attempt: Attempt = { version: 1, attemptId: crypto.randomUUID(), attemptNumber: (previous?.attemptNumber ?? 0) + 1,
      startedAt: now.toISOString(), uploadAcceptedAt: file.uploadedAt.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + IMPORT_ATTEMPT_LEASE_MS).toISOString(), outcome: "running",
      historicalAttemptsUnknown: previous?.historicalAttemptsUnknown ?? legacy };
    const owner = actorUserId ? null : await tx.workspace.findUnique({ where: { id: file.workspaceId }, select: { user: { select: { clerkUserId: true } } } });
    const record = await tx.auditLog.create({ data: { id: `import-attempt-${importId}-${String(attempt.attemptNumber).padStart(9, "0")}`,
      workspaceId: file.workspaceId, actorUserId: actorUserId ?? "system",
      action: IMPORT_ATTEMPT_ACTION, entity: "ImportFile", entityId: importId, metadata: attempt } });
    return { importId, workspaceId: file.workspaceId, actorUserId: actorUserId ?? owner?.user.clerkUserId ?? null, recordId: record.id, attempt } satisfies Claim;
  });
}

export function currentImportAttempt(importId: string) {
  const claim = context.getStore();
  return claim?.importId === importId ? claim : null;
}
export const withImportAttempt = <T>(claim: Claim, run: () => Promise<T>) => context.run(claim, run);

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

export async function finishImportAttempt(claim: Claim, threw: boolean) {
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
    ] }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const now = new Date();
    const phase = file.processingPhase;
    const outcome = saved ? "transaction_available"
      : phase === "cancelled" || phase === "cancel_requested" ? "cancelled"
      : phase === "paused" || phase === "pause_requested" ? "paused"
      : ["source_review_required", "receipt_review_required", "payment_account_review_required", "account_match_needs_confirmation", "password_required"].includes(phase ?? "") ? "input_required"
      : file.status === "done" ? "completed_without_transaction"
      : threw || file.status === "failed" ? "failed" : "pending";
    const attempt: Attempt = { ...previous, outcome, phase, endedAt: now.toISOString(),
      durationMs: Math.max(0, now.getTime() - Date.parse(previous.startedAt)),
      uploadToOutcomeMs: Math.max(0, now.getTime() - Date.parse(previous.uploadAcceptedAt)),
      // createdAt is set inside a transaction, before its commit. Observe the
      // committed row here instead of presenting that earlier clock as a save.
      ...(saved ? { transactionObservedAt: previous.transactionObservedAt ?? now.toISOString() } : {}),
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
    return { attempt, format, institution: institutionLabel ?? "unknown" };
  });
  if (result && claim.actorUserId) await capturePostHogServerEvent("import_attempt_finished", claim.actorUserId, {
    measurement_version: 2, import_format: result.format, import_institution: result.institution, import_file_id: claim.importId, workspace_id: claim.workspaceId,
    attempt_id: result.attempt.attemptId, attempt_number: result.attempt.attemptNumber,
    first_attempt: result.attempt.attemptNumber === 1 && !result.attempt.historicalAttemptsUnknown,
    historical_attempts_unknown: result.attempt.historicalAttemptsUnknown ?? false,
    outcome: result.attempt.outcome, processing_phase: result.attempt.phase, duration_ms: result.attempt.durationMs,
    upload_to_attempt_start_ms: Math.max(0, Date.parse(result.attempt.startedAt) - Date.parse(result.attempt.uploadAcceptedAt)),
    upload_to_outcome_ms: result.attempt.uploadToOutcomeMs, upload_to_transaction_available_ms: result.attempt.uploadToTransactionAvailableMs,
    timing_boundary: "server_upload_accepted_to_transaction_observed", // Conservative server observation, not UI rendering.
  }).catch(() => undefined);
  return result?.attempt ?? null;
}

/** Confirmation may happen after processing has returned a staged result.
 * Record that later availability separately without rewriting the first-pass
 * outcome or creating another parser attempt. */
export async function observeImportTransactionAvailability(importId: string) {
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
      transactionObservedAt:now.toISOString(),uploadToTransactionAvailableMs:Math.max(0,+now-Date.parse(attempt.uploadAcceptedAt))}}});
  });
}
