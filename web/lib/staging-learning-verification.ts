import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueLearningJob, processLearningJob, type LearningAction } from "@/lib/learning-jobs";

// This diagnostic has no production mode and never accepts a user/Profile ID.
export const LEARNING_QA_USER = "user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z";
export function assertLearningVerificationEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV !== "preview" || env.CLOVER_DEPLOYMENT_ENVIRONMENT !== "staging" || env.VERCEL_GIT_COMMIT_REF !== "staging") {
    throw new Error("VERIFICATION_UNAVAILABLE");
  }
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const journalId = (runId: string) => `learning-verification:${runId}`;
const profileId = (runId: string) => `learning-verification-${runId}`;
const missingCategoryId = (runId: string) => `learning-verification-category-${runId}`;

// Hash complete database rows, including timestamps, raw payloads, statuses and
// rule counters. Only this run's newly allocated Profile is excluded. A change
// by another session is reported, never reverted or silently accepted.
const tables = ["Workspace", "Account", "AccountTombstone", "Category", "Transaction", "ImportFile", "ParsedTransaction", "DocumentImport", "AccountStatementCheckpoint", "ReceiptDocument", "MerchantRule", "AccountRule", "TrainingSignal", "StatementTemplate", "DataQaRun", "DataQaFinding", "ImportFileExtractionCache", "ImportEnrichmentJob", "LearningJob", "DocumentImportPage", "LearningJobAttempt"] as const;
type Manifest = Record<string, { count: number; sha256: string }>;
const financialTables = new Set<string>(["Account", "AccountTombstone", "Transaction", "ImportFile", "ParsedTransaction", "DocumentImport", "AccountStatementCheckpoint", "ReceiptDocument", "DocumentImportPage"]);
export async function checkpointPreservationManifest(checkpointId: string, db: Prisma.TransactionClient): Promise<Manifest> {
  const result: Manifest = {};
  for (const table of tables) {
    const predicate = table === "AccountStatementCheckpoint" ? 'WHERE t."id" <> $1' : "";
    const rows = await db.$queryRawUnsafe<Array<{ count: number; sha256: string }>>(`SELECT count(*)::int AS count,
      encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex'), '' ORDER BY t."id"), ''), 'UTF8')), 'hex') AS sha256
      FROM "${table}" t ${predicate}`, ...(predicate ? [checkpointId] : []));
    result[table] = rows[0];
  }
  return result;
}
export async function learningVerificationManifest(workspaceId: string, own = false, db: Prisma.TransactionClient = prisma): Promise<Manifest> {
  const result: Manifest = {};
  for (const table of tables) {
    if (own && !financialTables.has(table)) continue;
    const workspaceExpression = table === "Workspace" ? 't."id"'
      : table === "DocumentImportPage" ? '(SELECT p."workspaceId" FROM "DocumentImport" p WHERE p."id" = t."documentImportId")'
      : table === "LearningJobAttempt" ? '(SELECT j."workspaceId" FROM "LearningJob" j WHERE j."id" = t."jobId")'
      : 't."workspaceId"';
    // Identifiers and operators are exclusively from the fixed list above.
    const rows = await db.$queryRawUnsafe<Array<{ count: number; sha256: string }>>(`SELECT count(*)::int AS count,
      encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex'), '' ORDER BY t."id"), ''), 'UTF8')), 'hex') AS sha256
      FROM "${table}" t WHERE ${workspaceExpression} ${own ? "=" : "<>"} $1`, workspaceId);
    result[table] = rows[0];
  }
  return result;
}
type RunState = { baseline: Manifest; protectedFinancial?: Manifest; failureJobId?: string; interruptionJobId?: string };
async function loadRun(runId: string, actor: string) {
  assertLearningVerificationEnvironment();
  const journal = await prisma.auditLog.findFirst({ where: { id: journalId(runId), actorUserId: actor, action: "learning.verification.started", entityId: runId } });
  if (!journal) throw new Error("VERIFICATION_NOT_FOUND");
  const workspace = await prisma.workspace.findFirst({ where: { id: profileId(runId), user: { clerkUserId: LEARNING_QA_USER, environment: "staging" } } });
  if (!workspace || journal.workspaceId !== workspace.id) throw new Error("VERIFICATION_NOT_FOUND");
  return { workspace, journal, state: journal.metadata as unknown as RunState };
}

export async function startLearningVerification(runId: string, actor: string) {
  assertLearningVerificationEnvironment();
  const existing = await prisma.auditLog.findUnique({ where: { id: journalId(runId) } });
  if (existing) { const run = await loadRun(runId, actor); return { runId, workspaceId: run.workspace.id, baseline: run.state.baseline }; }
  const user = await prisma.user.findFirst({ where: { clerkUserId: LEARNING_QA_USER, environment: "staging" } });
  if (!user) throw new Error("VERIFICATION_QA_ACCOUNT_UNAVAILABLE");
  return prisma.$transaction(async db => {
    const baseline = await learningVerificationManifest(profileId(runId), false, db);
    await db.workspace.create({ data: { id: profileId(runId), userId: user.id, name: `Learning verification ${runId.slice(0, 8)}`, type: "personal" } });
    await db.auditLog.create({ data: { id: journalId(runId), workspaceId: profileId(runId), actorUserId: actor, action: "learning.verification.started", entity: "LearningVerification", entityId: runId, metadata: json({ baseline }) } });
    return { runId, workspaceId: profileId(runId), baseline };
  }, { isolationLevel: "RepeatableRead", timeout: 45_000 });
}

// Run only after the ordinary upload/edit/import flow. These three-item batches
// exercise the deployed worker with a missing fixture reference and an expired
// lease. They do not kill a live worker, delete a reference, or alter its input.
export async function prepareLearningVerificationCheckpoints(runId: string, actor: string) {
  const run = await loadRun(runId, actor);
  if (run.state.failureJobId || run.state.interruptionJobId) return run.state;
  const transaction = await prisma.transaction.findFirst({ where: { workspaceId: run.workspace.id, deletedAt: null, categoryId: { not: null }, reviewStatus: { in: ["confirmed", "edited"] } }, include: { category: true }, orderBy: { createdAt: "asc" } });
  if (!transaction?.category) throw new Error("VERIFICATION_NEEDS_REVIEWED_TRANSACTION");
  const protectedFinancial = await prisma.$transaction(db => learningVerificationManifest(run.workspace.id, true, db), { isolationLevel: "RepeatableRead", timeout: 30_000 });
  const action = (label: string, categoryId = transaction.category!.id): LearningAction => ({ kind: "signal", input: {
    workspaceId: run.workspace.id, importFileId: transaction.importFileId,
    merchantText: `Verification ${label} ${runId}`, normalizedName: `Verification ${label}`,
    categoryId, categoryName: "Verification fixture", type: "expense", source: "training_upload", confidence: 75,
    notes: "Synthetic checkpoint probe in an isolated staging verification Profile.",
  } });
  const failure = await enqueueLearningJob({ workspaceId: run.workspace.id, source: "staging_verification_failure", sourceId: runId, actions: [action("saved first"), action("missing reference", missingCategoryId(runId)), action("saved last")] });
  const interruption = await enqueueLearningJob({ workspaceId: run.workspace.id, source: "staging_verification_interruption", sourceId: runId, actions: [action("resume first"), action("resume second"), action("resume last")] });
  if (!failure || !interruption) throw new Error("VERIFICATION_LEARNING_DISABLED");
  // Save the IDs first, so a disconnected caller can retrieve and resume them.
  const state = { ...run.state, protectedFinancial, failureJobId: failure.id, interruptionJobId: interruption.id };
  await prisma.auditLog.update({ where: { id: run.journal.id }, data: { metadata: json(state) } });
  await processLearningJob(failure.id);
  await processLearningJob(interruption.id, { maxItems: 1 });
  await prisma.$transaction(async db => {
    const current = await db.learningJob.findUniqueOrThrow({ where: { id: interruption.id } });
    // A concurrent real worker wins; never steal its lease or rewind progress.
    const updated = await db.learningJob.updateMany({ where: { id: current.id, workspaceId: run.workspace.id, status: "queued", nextIndex: 1, attempts: current.attempts }, data: { status: "running", leaseToken: `verification-${runId}`, lockedUntil: new Date(0), attempts: { increment: 1 } } });
    if (updated.count) await db.learningJobAttempt.create({ data: { jobId: current.id, attempt: current.attempts + 1, status: "running", startIndex: 1, endIndex: 1 } });
  });
  return state;
}

export async function repairLearningVerificationReference(runId: string, actor: string) {
  const run = await loadRun(runId, actor);
  if (!run.state.failureJobId) throw new Error("VERIFICATION_CHECKPOINTS_NOT_PREPARED");
  await prisma.category.upsert({ where: { id: missingCategoryId(runId) }, create: { id: missingCategoryId(runId), workspaceId: run.workspace.id, name: "Verification restored reference", type: "expense" }, update: {} });
  return { repaired: true, jobId: run.state.failureJobId };
}

export async function inspectLearningVerification(runId: string, actor: string) {
  const run = await loadRun(runId, actor);
  const where = { workspaceId: run.workspace.id };
  const { outside, financial } = await prisma.$transaction(async db => ({
    outside: await learningVerificationManifest(run.workspace.id, false, db),
    financial: await learningVerificationManifest(run.workspace.id, true, db),
  }), { isolationLevel: "RepeatableRead", timeout: 45_000 });
  const [accounts, transactions, files, parsedRows, rules, signals, accountRules, templates, jobs] = await Promise.all([
    prisma.account.findMany({ where }), prisma.transaction.findMany({ where, orderBy: { id: "asc" } }), prisma.importFile.findMany({ where }), prisma.parsedTransaction.findMany({ where }),
    prisma.merchantRule.findMany({ where }), prisma.trainingSignal.findMany({ where }), prisma.accountRule.findMany({ where }), prisma.statementTemplate.findMany({ where }),
    prisma.learningJob.findMany({ where, omit: { payload: true }, include: { runs: { orderBy: { attempt: "asc" } } } }),
  ]);
  const changed = (before: Manifest, after: Manifest) => Object.keys(before).filter(table => before[table].count !== after[table]?.count || before[table].sha256 !== after[table]?.sha256);
  return { runId, workspaceId: run.workspace.id, baseline: run.state.baseline, current: outside, changedOutsideProfile: changed(run.state.baseline, outside), financial,
    changedProtectedFinancial: run.state.protectedFinancial ? changed(run.state.protectedFinancial, financial) : null,
    failureJobId: run.state.failureJobId, interruptionJobId: run.state.interruptionJobId,
    accounts, transactions, files, parsedRows, rules, signals, accountRules, templates, jobs };
}

// A reviewed retained fixture in the already-owned verification Profile only.
// No arbitrary import/Profile/source input and no production execution path.
export async function repairVerificationBpiCheckpoint(runId: string, actor: string, expectedPlanHash?: string) {
  const run = await loadRun(runId, actor);
  if (runId !== "857a2856-a14e-4d6a-b3ba-da7a4430d57c") throw new Error("VERIFICATION_NOT_FOUND");
  const importFileId = "8355c0a1-1b78-490d-868f-3ccb5ce4b1b5";
  const sourceSha256 = "1ca7bedede14497963e97e77782054e15cda64e0bfd74e445df9fdce8f6a3b73";
  const file = await prisma.importFile.findFirstOrThrow({ where: { id: importFileId, workspaceId: run.workspace.id, sourceFingerprint: sourceSha256 } });
  const { downloadImportObject } = await import("@/lib/import-storage.server");
  const { readUploadedFileText } = await import("@/lib/import-file-text.server");
  const { planBpiCheckpointRepair } = await import("@/lib/bpi-checkpoint-repair");
  const bytes = await downloadImportObject(file.storageKey);
  if (createHash("sha256").update(bytes).digest("hex") !== sourceSha256) throw new Error("VERIFICATION_SOURCE_CHANGED");
  // Read original bytes directly; do not refresh or replace extraction caches.
  const text = await readUploadedFileText(new File([Buffer.from(bytes)], file.fileName, { type: file.fileType }));
  return prisma.$transaction(async db => {
    const plan = await planBpiCheckpointRepair(db, { importFileId, workspaceId: run.workspace.id, sourceSha256, text });
    const before = await checkpointPreservationManifest(plan.checkpoint.id, db);
    if (!expectedPlanHash) return { plan, preservation: before, sourceSha256 };
    if (plan.planHash !== expectedPlanHash) throw new Error("VERIFICATION_PLAN_CHANGED");
    if (plan.unchanged) return { unchanged: true, checkpoint: plan.checkpoint, preservation: before, sourceSha256 };
    const checkpoint = await db.accountStatementCheckpoint.update({ where: { id: plan.checkpoint.id }, data: plan.patch });
    const after = await checkpointPreservationManifest(checkpoint.id, db);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("VERIFICATION_PRESERVATION_FAILED");
    await db.auditLog.create({ data: { workspaceId: run.workspace.id, actorUserId: actor, action: "statement.checkpoint.metadata_repaired", entity: "AccountStatementCheckpoint", entityId: checkpoint.id,
      metadata: json({ before: plan.checkpoint, after: checkpoint, sourceSha256, preservation: before, planHash: plan.planHash }) } });
    return { unchanged: false, checkpoint, preservation: after, sourceSha256 };
  }, { isolationLevel: "Serializable", timeout: 45_000 });
}
