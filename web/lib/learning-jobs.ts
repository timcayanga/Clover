import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAppPreferences } from "@/lib/app-preferences";
import type { RecordTrainingSignalInput, upsertAccountRule, upsertStatementTemplate } from "@/lib/data-engine";

export type LearningAction =
  | { kind: "signal"; input: RecordTrainingSignalInput }
  | { kind: "account"; input: Parameters<typeof upsertAccountRule>[0] }
  | { kind: "template"; input: Parameters<typeof upsertStatementTemplate>[0]; sourceImportFileId?: string; requireCompletedSource?: boolean; requireReviewedTransactions?: boolean; learnCandidates?: boolean };
export type LearningWriteContext = { db: Prisma.TransactionClient; observedAt: Date; observationKey: string };
export const LEARNING_JOB_VERSION = 1;
const LEASE_MS = 120_000;
const MAX_FAILURES = 3;

// Stable content addressing, independent of object key ordering and retry time.
export function learningDigest(value: unknown): string {
  const stable = (v: unknown): unknown => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]))
    : Array.isArray(v) ? v.map(stable) : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export class LearningInputError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// Never persist raw driver messages (they can contain SQL, source data or credentials).
export function learningFailure(error: unknown) {
  if (error instanceof LearningInputError) return { errorCode: error.code, errorMessage: error.message };
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["P2003", "P2025"].includes(code)) return { errorCode: "SOURCE_UNAVAILABLE", errorMessage: "A source, category or account is no longer available. Review this job before retrying." };
  if (["P2021", "P2022"].includes(code)) return { errorCode: "SCHEMA_NOT_READY", errorMessage: "The learning database migration is missing. Apply the release migration, then retry." };
  if (["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"].includes(code)) return { errorCode: "DATABASE_RETRY", errorMessage: "The database was unavailable, busy or interrupted. Saved progress is safe to retry." };
  return { errorCode: /^P[0-9]{4}$/.test(code) ? `LEARNING_${code}` : "LEARNING_WRITE_FAILED", errorMessage: /^P[0-9]{4}$/.test(code) ? `The database rejected a learning write (${code}). Saved progress is retained; inspect the failing item before retrying.` : "A learning write failed. Saved progress is retained; retry after checking the learning worker." };
}

export async function enqueueLearningJob(params: {
  workspaceId: string; source: string; sourceId?: string | null; actions: LearningAction[];
}, db: Prisma.TransactionClient = prisma) {
  if (!params.actions.length) return null;
  const workspace = await db.workspace.findUnique({ where: { id: params.workspaceId }, select: { user: { select: { appPreferences: true } } } });
  if (!workspace) throw new LearningInputError("PROFILE_UNAVAILABLE", "The learning Profile no longer exists.");
  if (!parseAppPreferences(workspace.user.appPreferences).privacy.improveSuggestions) return null;
  if (params.actions.some(action => action.input.workspaceId !== params.workspaceId)) throw new LearningInputError("PROFILE_MISMATCH", "Learning input belongs to a different Profile.");
  const payload = JSON.parse(JSON.stringify(params.actions)) as Prisma.InputJsonValue;
  const dedupeKey = learningDigest({ version: LEARNING_JOB_VERSION, source: params.source, sourceId: params.sourceId ?? null, payload });
  // An enqueue never resets progress, error history, status or the original payload.
  return db.learningJob.upsert({
    where: { workspaceId_dedupeKey: { workspaceId: params.workspaceId, dedupeKey } },
    create: { workspaceId: params.workspaceId, source: params.source, sourceId: params.sourceId ?? null, dedupeKey, payload, totalItems: params.actions.length },
    update: {},
  });
}

export async function processLearningJob(id: string, options: { maxItems?: number; deadlineMs?: number } = {}) {
  const token = randomUUID();
  const now = new Date();
  const claimed = await prisma.$transaction(async db => {
    // Claim and attempt history are atomic; another worker cannot steal an active lease.
    const changed = await db.learningJob.updateMany({
      where: { id, failureCount: { lt: MAX_FAILURES }, OR: [
        { status: "queued", nextAttemptAt: { lte: now } },
        { status: "running", lockedUntil: { lt: now } },
      ] },
      data: { status: "running", leaseToken: token, lockedUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (!changed.count) return null;
    const job = await db.learningJob.findUniqueOrThrow({ where: { id } });
    await db.learningJobAttempt.updateMany({ where: { jobId: id, status: "running" }, data: {
      status: "interrupted", finishedAt: now, endIndex: job.nextIndex,
      errorCode: "LEASE_EXPIRED", errorMessage: "The worker stopped before completion. Processing resumed from the last committed item.",
    } });
    await db.learningJobAttempt.create({ data: { jobId: id, attempt: job.attempts, status: "running", startIndex: job.nextIndex, endIndex: job.nextIndex } });
    return job;
  });
  if (!claimed) return prisma.learningJob.findUnique({ where: { id }, omit: { payload: true } });
  const stopAt = Date.now() + Math.min(45_000, options.deadlineMs ?? 20_000);
  let processed = 0;
  try {
    const { applyLearningAction } = await import("@/lib/data-engine");
    while (processed < (options.maxItems ?? 200) && Date.now() < stopAt) {
      const state = await prisma.$transaction(async db => {
        // Row lock plus token fence ties each observation and its checkpoint to one commit.
        await db.$queryRaw`SELECT "id" FROM "LearningJob" WHERE "id" = ${id} FOR UPDATE`;
        const job = await db.learningJob.findUniqueOrThrow({ where: { id }, omit: { payload: true } });
        if (job.leaseToken !== token || job.status !== "running") return "lost";
        if (job.version !== LEARNING_JOB_VERSION) throw new LearningInputError("UNSUPPORTED_VERSION", "This job requires a different learning worker version. Keep its input and deploy the matching worker.");
        if (job.nextIndex >= job.totalItems) return "done";
        const workspace = await db.workspace.findUniqueOrThrow({ where: { id: job.workspaceId }, select: { user: { select: { appPreferences: true } } } });
        if (!parseAppPreferences(workspace.user.appPreferences).privacy.improveSuggestions) {
          await db.learningJob.update({ where: { id }, select: { id: true }, data: { status: "cancelled", leaseToken: null, lockedUntil: null, errorCode: "LEARNING_DISABLED", errorMessage: "Learning is disabled in this account’s privacy settings.", completedAt: new Date() } });
          await db.learningJobAttempt.update({ where: { jobId_attempt: { jobId: id, attempt: job.attempts } }, data: { status: "cancelled", endIndex: job.nextIndex, finishedAt: new Date(), errorCode: "LEARNING_DISABLED" } });
          return "lost";
        }
        // The claimed input is immutable: read the batch once per slice, not once per item.
        const action = (claimed.payload as unknown as LearningAction[])[job.nextIndex];
        if (!action || action.input.workspaceId !== job.workspaceId) throw new LearningInputError("INVALID_INPUT", "The saved learning input is invalid for this Profile.");
        // Serialize rule updates within a Profile, including distinct overlapping batches.
        await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${job.workspaceId}, 0))::text`;
        const applied = await applyLearningAction(action, { db, observedAt: job.createdAt, observationKey: learningDigest(action) });
        await db.learningJob.update({ where: { id }, select: { id: true }, data: {
          nextIndex: { increment: 1 }, appliedItems: { increment: applied ? 1 : 0 }, skippedItems: { increment: applied ? 0 : 1 },
          lockedUntil: new Date(Date.now() + LEASE_MS),
        } });
        return "next";
      }, { timeout: 20_000, maxWait: 10_000 });
      if (state === "lost") return prisma.learningJob.findUnique({ where: { id }, omit: { payload: true } });
      if (state === "done") break;
      processed++;
    }
    await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "LearningJob" WHERE "id" = ${id} FOR UPDATE`;
      const job = await db.learningJob.findUniqueOrThrow({ where: { id }, omit: { payload: true } });
      if (job.leaseToken !== token) return;
      const done = job.nextIndex === job.totalItems;
      await db.learningJob.update({ where: { id }, select: { id: true }, data: { status: done ? "completed" : "queued", leaseToken: null, lockedUntil: null, completedAt: done ? new Date() : null, nextAttemptAt: new Date(), errorCode: null, errorMessage: null } });
      await db.learningJobAttempt.update({ where: { jobId_attempt: { jobId: id, attempt: job.attempts } }, data: { status: done ? "completed" : "yielded", endIndex: job.nextIndex, finishedAt: new Date() } });
    });
  } catch (error) {
    const failure = learningFailure(error);
    const waiting = failure.errorCode === "SOURCE_NOT_READY";
    await prisma.$transaction(async db => {
      const changed = await db.learningJob.updateMany({ where: { id, leaseToken: token }, data: {
        status: waiting ? "queued" : "failed", leaseToken: null, lockedUntil: null, failureCount: { increment: waiting ? 0 : 1 },
        ...failure, nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** claimed.failureCount),
      } });
      if (changed.count) {
        const job = await db.learningJob.findUniqueOrThrow({ where: { id }, omit: { payload: true } });
        await db.learningJobAttempt.update({ where: { jobId_attempt: { jobId: id, attempt: job.attempts } }, data: { status: waiting ? "waiting" : "failed", endIndex: job.nextIndex, finishedAt: new Date(), ...failure } });
      }
    });
  }
  return prisma.learningJob.findUnique({ where: { id }, omit: { payload: true } });
}

export async function retryLearningJob(id: string, workspaceId: string) {
  if (!await prisma.learningJob.findFirst({ where: { id, workspaceId }, select: { id: true } })) return null;
  // Manual retry authorizes another attempt, never resets its checkpoint or deletes evidence.
  await prisma.learningJob.updateMany({ where: { id, workspaceId, status: { in: ["failed", "queued"] } }, data: { status: "queued", failureCount: 0, nextAttemptAt: new Date() } });
  return processLearningJob(id);
}

export async function processPendingLearningJobs(options: { workspaceId?: string; limit?: number } = {}) {
  const now = new Date();
  const where = { ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}), failureCount: { lt: MAX_FAILURES } };
  await prisma.learningJob.updateMany({ where: { ...where, status: "failed", nextAttemptAt: { lte: now }, errorCode: "DATABASE_RETRY" }, data: { status: "queued" } });
  const jobs = await prisma.learningJob.findMany({ where: { ...where, OR: [{ status: "queued", nextAttemptAt: { lte: now } }, { status: "running", lockedUntil: { lt: now } }] }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: Math.min(5, options.limit ?? 2), select: { id: true } });
  const results = [];
  for (const job of jobs) results.push(await processLearningJob(job.id));
  return results.map(job => job && ({ id: job.id, status: job.status, processed: job.nextIndex, total: job.totalItems }));
}
