import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "@/lib/prisma";
import { readGcashBillsBillerAccountEvidence } from "@/lib/gcash-bills-receipt";
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
export const stagingManifestTables = ["Workspace", "Account", "AccountTombstone", "Category", "Transaction", "ImportFile", "ParsedTransaction", "DocumentImport", "AccountStatementCheckpoint", "ReceiptDocument", "MerchantRule", "AccountRule", "TrainingSignal", "StatementTemplate", "DataQaRun", "DataQaFinding", "ImportFileExtractionCache", "ImportEnrichmentJob", "LearningJob", "DocumentImportPage", "LearningJobAttempt"] as const;
const tables = stagingManifestTables;
type Manifest = Record<string, { count: number; sha256: string }>;
const financialTables = new Set<string>(["Account", "AccountTombstone", "Transaction", "ImportFile", "ParsedTransaction", "DocumentImport", "AccountStatementCheckpoint", "ReceiptDocument", "DocumentImportPage"]);
const readSnapshotTimeout = 240_000;

function manifestWorkspaceExpression(table: string) {
  return table === "Workspace" ? 't."id"'
    : table === "DocumentImportPage" || table === "LearningJobAttempt" ? 'manifest_parent."workspaceId"'
    : 't."workspaceId"';
}

function manifestParentJoin(table: string) {
  // These parent IDs are unique. A left join preserves the scalar lookup's
  // null semantics without repeating a correlated lookup for every child row.
  return table === "DocumentImportPage" ? 'LEFT JOIN "DocumentImport" manifest_parent ON manifest_parent."id" = t."documentImportId"'
    : table === "LearningJobAttempt" ? 'LEFT JOIN "LearningJob" manifest_parent ON manifest_parent."id" = t."jobId"'
    : "";
}

async function readManifest(db: Prisma.TransactionClient, selectedTables: readonly string[], predicates: string[], params: unknown[], rowVersions = false): Promise<Manifest> {
  if (db === prisma) return prisma.$transaction(
    tx => readManifest(tx, selectedTables, predicates, params, rowVersions),
    { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout },
  );
  // The table list and predicates are built only from the fixed diagnostic lists.
  // Keep the original complete-row PostgreSQL hashes; batch round trips, not evidence.
  // PostgreSQL assigns a new xmin to an updated tuple. Combining it with the
  // primary key checks for inserts, deletes and updates without detoasting source images.
  const rowText = rowVersions ? 'jsonb_build_array(t."id", t.xmin::text)::text' : 'to_jsonb(t)::text';
  const statements = selectedTables.map((table, index) => `SELECT '${table}'::text AS "table", count(*)::int AS count,
    encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(${rowText}, 'UTF8')), 'hex'), '' ORDER BY t."id"), ''), 'UTF8')), 'hex') AS sha256
    FROM "${table}" t ${manifestParentJoin(table)} ${predicates[index]}`);
  const rows: Array<{ table: string; count: number; sha256: string }> = [];
  // Some groups do not reference the retained checkpoint parameter. Bind its
  // type explicitly without adding it to a predicate or any hashed row.
  const bindings = `WITH manifest_parameters AS (SELECT ${params.map((value, index) =>
    `$${index + 1}::${Array.isArray(value) ? "text[]" : "text"} AS p${index + 1}`,
  ).join(", ")}) `;
  // Keep all tables in the caller's same repeatable-read snapshot. Bound each
  // statement's work as retained source evidence grows; do not shorten hashes,
  // drop tables or change the read/write transaction budgets.
  // Wide source and transaction rows can exceed the pooler statement limit when
  // four full tables share a query. Keep each global table in its own statement.
  const tablesPerQuery = params.some(Array.isArray) ? 1 : 4;
  for (let offset = 0; offset < statements.length; offset += tablesPerQuery) {
    rows.push(...await db.$queryRawUnsafe<Array<{ table: string; count: number; sha256: string }>>(
      bindings + statements.slice(offset, offset + tablesPerQuery).join(" UNION ALL "), ...params,
    ));
  }
  const byTable = new Map(rows.map(row => [row.table, row]));
  const result: Manifest = {};
  for (const table of selectedTables) {
    const row = byTable.get(table);
    if (!row || rows.length !== selectedTables.length) throw new Error("VERIFICATION_MANIFEST_INCOMPLETE");
    result[table] = { count: row.count, sha256: row.sha256 };
  }
  return result;
}

export async function checkpointPreservationManifest(checkpointId: string, db: Prisma.TransactionClient, excludedWorkspaceIds: string[] = [], table?: typeof tables[number], rowVersions = false): Promise<Manifest> {
  const params: unknown[] = [checkpointId];
  if (excludedWorkspaceIds.length) params.push(excludedWorkspaceIds);
  const selected = table ? tables.filter(name => name === table) : tables;
  const predicates = selected.map(table => {
    const conditions: string[] = [];
    if (table === "AccountStatementCheckpoint") conditions.push('t."id" <> $1');
    if (excludedWorkspaceIds.length) {
      const expression = manifestWorkspaceExpression(table);
      conditions.push(`(${expression} IS NULL OR NOT (${expression} = ANY($2::text[])))`);
    }
    return conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  });
  return readManifest(db, selected, predicates, params, rowVersions);
}
export async function learningVerificationManifest(workspaceId: string, own = false, db: Prisma.TransactionClient = prisma): Promise<Manifest> {
  const selectedTables = tables.filter(table => !own || financialTables.has(table));
  const predicates = selectedTables.map(table => {
    const workspaceExpression = manifestWorkspaceExpression(table);
    return `WHERE ${workspaceExpression} ${own ? "=" : "<>"} $1`;
  });
  return readManifest(db, selectedTables, predicates, [workspaceId]);
}
// The full inspect response can repeat the complete source document in every
// parsed row and transaction. Compare all fields on the database side when a
// caller only needs to prove that an already reviewed report stayed unchanged.
export async function learningVerificationOwnCompleteManifest(workspaceId: string, db: Prisma.TransactionClient = prisma): Promise<Manifest> {
  return readManifest(db, tables, tables.map(table => `WHERE ${manifestWorkspaceExpression(table)} = $1`), [workspaceId]);
}
type RunState = { rowVersions?: boolean; baseline: Manifest; batchRunIds?: string[]; retainedCheckpoint?: unknown; protectedFinancial?: Manifest; failureJobId?: string; interruptionJobId?: string };
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
  // The complete-row snapshot runs before the two isolated inserts. Allow the
  // same budget as a read-only preservation scan, within the 300-second route.
  }, { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout });
}

const retainedCheckpointId = "cmv29w3r4002806ictv6bmnfp";

function batchWorkspaceIds(runIds: string[]) {
  if (runIds.length < 1 || runIds.length > 32 || new Set(runIds).size !== runIds.length ||
    runIds.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) {
    throw new Error("VERIFICATION_NOT_FOUND");
  }
  return [...runIds].sort().map(profileId);
}

/** Allocate all QA Profiles behind one complete snapshot. */
export async function startLearningVerificationBatch(runIds: string[], actor: string, rowVersions = false) {
  assertLearningVerificationEnvironment();
  const workspaceIds = batchWorkspaceIds(runIds);
  const orderedRunIds = [...runIds].sort();
  return prisma.$transaction(async db => {
    const journals = await db.auditLog.findMany({ where: { id: { in: orderedRunIds.map(journalId) } } });
    if (journals.length) {
      if (journals.length !== runIds.length || journals.some(journal =>
        journal.actorUserId !== actor || journal.action !== "learning.verification.started" ||
        Boolean((journal.metadata as unknown as RunState).rowVersions) !== rowVersions ||
        JSON.stringify((journal.metadata as unknown as RunState).batchRunIds) !== JSON.stringify(orderedRunIds))) {
        throw new Error("VERIFICATION_NOT_FOUND");
      }
      return { runIds: orderedRunIds, excludedProfiles: workspaceIds, baseline: (journals[0].metadata as unknown as RunState).baseline, retainedCheckpoint: (journals[0].metadata as unknown as RunState).retainedCheckpoint };
    }

    const user = await db.user.findFirst({ where: { clerkUserId: LEARNING_QA_USER, environment: "staging" } });
    if (!user) throw new Error("VERIFICATION_QA_ACCOUNT_UNAVAILABLE");
    const baseline = await checkpointPreservationManifest(retainedCheckpointId, db, workspaceIds, undefined, rowVersions);
    const retainedCheckpoint = await db.accountStatementCheckpoint.findUnique({ where: { id: retainedCheckpointId } });
    await db.workspace.createMany({ data: orderedRunIds.map(id => ({
      id: profileId(id), userId: user.id, name: `Learning verification ${id.slice(0, 8)}`, type: "personal",
    })) });
    await db.auditLog.createMany({ data: orderedRunIds.map(id => ({
      id: journalId(id), workspaceId: profileId(id), actorUserId: actor, action: "learning.verification.started",
      entity: "LearningVerification", entityId: id, metadata: json({ baseline, batchRunIds: orderedRunIds, retainedCheckpoint, ...(rowVersions ? { rowVersions: true } : {}) }),
    })) });
    return { runIds: orderedRunIds, excludedProfiles: workspaceIds, baseline, retainedCheckpoint: json(retainedCheckpoint) };
  }, { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout });
}

/** Capture each protected table before any training in this isolated QA workspace.
 * A committed table can be resumed. Only the final table unlocks the QA journal. */
export async function prepareVersionBaselineTable(runId: string, actor: string, table: typeof tables[number]) {
  assertLearningVerificationEnvironment();
  const workspaces = batchWorkspaceIds([runId]);
  if (!tables.includes(table)) throw new Error("VERIFICATION_NOT_FOUND");
  const id = journalId(runId);
  return prisma.$transaction(async db => {
    let journal = await db.auditLog.findUnique({ where: { id } });
    if (!journal) {
      const user = await db.user.findFirst({ where: { clerkUserId: LEARNING_QA_USER, environment: "staging" } });
      if (!user) throw new Error("VERIFICATION_QA_ACCOUNT_UNAVAILABLE");
      const retainedCheckpoint = await db.accountStatementCheckpoint.findUniqueOrThrow({ where: { id: retainedCheckpointId } });
      await db.workspace.create({ data: { id: workspaces[0], userId: user.id, type: "personal", name: `Learning verification ${runId.slice(0, 8)}` } });
      journal = await db.auditLog.create({ data: { id, workspaceId: workspaces[0], actorUserId: actor,
        entity: "LearningVerification", entityId: runId, action: "learning.verification.preparing",
        metadata: json({ baseline: {}, batchRunIds: [runId], rowVersions: true, perTable: true, retainedCheckpoint }) } });
    }
    const state = journal.metadata as unknown as RunState & { perTable?: boolean };
    if (journal.actorUserId !== actor || journal.workspaceId !== workspaces[0] || journal.entityId !== runId ||
        !["learning.verification.preparing", "learning.verification.started"].includes(journal.action) || !state.perTable) {
      throw new Error("VERIFICATION_NOT_FOUND");
    }
    if (!state.baseline[table]) {
      // Repeatable read makes concurrent journal updates conflict instead of losing a table.
      Object.assign(state.baseline, await checkpointPreservationManifest(retainedCheckpointId, db, workspaces, table, true));
      const complete = tables.every(name => Boolean(state.baseline[name]));
      await db.auditLog.update({ where: { id }, data: { metadata: json(state),
        action: complete ? "learning.verification.started" : "learning.verification.preparing" } });
    }
    return { runIds: [runId], excludedProfiles: workspaces, baseline: state.baseline,
      retainedCheckpoint: state.retainedCheckpoint, complete: tables.every(name => Boolean(state.baseline[name])) };
  }, { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout });
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

export async function inspectLearningVerification(runId: string, actor: string, ownOnly = false) {
  const run = await loadRun(runId, actor);
  const where = { workspaceId: run.workspace.id };
  const { outside, financial } = await prisma.$transaction(async db => ({
    outside: ownOnly || run.state.batchRunIds ? null : await learningVerificationManifest(run.workspace.id, false, db),
    financial: await learningVerificationManifest(run.workspace.id, true, db),
  }), { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout });
  const [accounts, transactions, files, parsedRows, rules, signals, accountRules, templates, jobs] = await Promise.all([
    prisma.account.findMany({ where }), prisma.transaction.findMany({ where, orderBy: { id: "asc" } }), prisma.importFile.findMany({ where }), prisma.parsedTransaction.findMany({ where }),
    prisma.merchantRule.findMany({ where }), prisma.trainingSignal.findMany({ where }), prisma.accountRule.findMany({ where }), prisma.statementTemplate.findMany({ where }),
    prisma.learningJob.findMany({ where, omit: { payload: true }, include: { runs: { orderBy: { attempt: "asc" } } } }),
  ]);
  const changed = (before: Manifest, after: Manifest) => Object.keys(before).filter(table => before[table].count !== after[table]?.count || before[table].sha256 !== after[table]?.sha256);
  return { runId, workspaceId: run.workspace.id, baseline: run.state.baseline, current: outside, changedOutsideProfile: outside ? changed(run.state.baseline, outside) : null, financial,
    changedProtectedFinancial: run.state.protectedFinancial ? changed(run.state.protectedFinancial, financial) : null,
    failureJobId: run.state.failureJobId, interruptionJobId: run.state.interruptionJobId,
    accounts, transactions, files, parsedRows, rules, signals, accountRules, templates, jobs,
    retrievedSourceEvidence: parsedRows.flatMap(row => { const evidence = readGcashBillsBillerAccountEvidence(row.rawPayload); return evidence ? [{ parsedRowId: row.id, ...evidence }] : []; }) };
}

/** Small polling response. It never retrieves raw source or normalized payloads. */
export async function inspectLearningVerificationStatus(runId: string, actor: string) {
  const run = await loadRun(runId, actor);
  const where = { workspaceId: run.workspace.id };
  const [files, jobs, transactionCount, parsedRowCount] = await Promise.all([
    prisma.importFile.findMany({ where, select: { id: true, status: true, processingPhase: true, processingMessage: true } }),
    prisma.learningJob.findMany({ where, select: { id: true, status: true, nextIndex: true, totalItems: true, errorCode: true } }),
    prisma.transaction.count({ where }),
    prisma.parsedTransaction.count({ where }),
  ]);
  return { runId, workspaceId: run.workspace.id, files, jobs, transactionCount, parsedRowCount };
}

/** Complete-row proof for repeat reads and final audits, with only hashes on the wire. */
export async function inspectLearningVerificationDigest(runId: string, actor: string, ownOnly = false) {
  const run = await loadRun(runId, actor);
  const { outside, own } = await prisma.$transaction(async db => ({
    outside: ownOnly || run.state.batchRunIds ? null : await learningVerificationManifest(run.workspace.id, false, db),
    own: await learningVerificationOwnCompleteManifest(run.workspace.id, db),
  }), { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout });
  const changed = (before: Manifest, after: Manifest) => Object.keys(before).filter(table => before[table].count !== after[table]?.count || before[table].sha256 !== after[table]?.sha256);
  return { runId, workspaceId: run.workspace.id, outside, own,
    changedOutsideProfile: outside ? changed(run.state.baseline, outside) : null,
    changedProtectedFinancial: run.state.protectedFinancial ? changed(run.state.protectedFinancial, Object.fromEntries(Object.entries(own).filter(([table]) => financialTables.has(table)))) : null };
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

/** Read-only aggregate: only actor-owned staging QA runs can be excluded. */
async function loadPreservationBatch(runIds: string[], actor: string) {
  assertLearningVerificationEnvironment();
  const workspaces = batchWorkspaceIds(runIds);
  const runs = await Promise.all(runIds.map(id => loadRun(id, actor)));
  const batch = runs.find(run => run.state.batchRunIds)?.state;
  if (batch && runs.some(run => JSON.stringify(run.state.batchRunIds) !== JSON.stringify([...runIds].sort()))) {
    throw new Error("VERIFICATION_NOT_FOUND");
  }
  return { workspaces, batch };
}

// Return only ordered fixed-length row hashes. Their concatenation across pages has
// precisely the same SHA-256 as readManifest, regardless of the page boundaries.
export async function previewPreservationHashPage(runIds: string[], actor: string, table: typeof tables[number], after?: string, pageSize = 512) {
  const { workspaces } = await loadPreservationBatch(runIds, actor);
  if (!tables.includes(table)) throw new Error("VERIFICATION_NOT_FOUND");
  const scope = manifestWorkspaceExpression(table);
  const checkpoint = table === "AccountStatementCheckpoint" ? 'AND t."id" <> $3' : '';
  const params: unknown[] = [workspaces, after ?? null];
  if (checkpoint) params.push(retainedCheckpointId);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 512) throw new Error("VERIFICATION_NOT_FOUND");
  params.push(pageSize);
  const rows = await prisma.$queryRawUnsafe<{ id: string; digest: string }[]>(
    `SELECT t."id", encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')), 'hex') AS digest
     FROM "${table}" t ${manifestParentJoin(table)}
     WHERE (${scope} IS NULL OR NOT (${scope} = ANY($1::text[])))
       AND ($2::text IS NULL OR t."id" > $2::text) ${checkpoint}
     ORDER BY t."id" LIMIT $${params.length}::int`, ...params);
  return { table, count: rows.length, hashes: rows.map(row => row.digest).join(""),
    next: rows.length === pageSize ? rows[rows.length - 1].id : null };
}

export async function previewLearningBatchPreservation(runIds: string[], actor: string, table?: typeof tables[number]) {
  const { workspaces, batch } = await loadPreservationBatch(runIds, actor);
  return prisma.$transaction(async db => {
    const preservation = await checkpointPreservationManifest(retainedCheckpointId, db, workspaces, table, batch?.rowVersions);
    const retainedCheckpoint = await db.accountStatementCheckpoint.findUnique({ where: { id: retainedCheckpointId } });
    return { runIds, excludedProfiles: workspaces, preservation, retainedCheckpoint, ...(batch ? {
      changedOutsideBatch: Object.keys(preservation).filter(table =>
        batch.baseline[table].count !== preservation[table]?.count || batch.baseline[table].sha256 !== preservation[table]?.sha256),
      retainedCheckpointUnchanged: isDeepStrictEqual(batch.retainedCheckpoint, json(retainedCheckpoint)),
    } : {}) };
  }, { isolationLevel: "RepeatableRead", timeout: readSnapshotTimeout });
}
