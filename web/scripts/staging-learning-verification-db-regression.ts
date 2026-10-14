import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));
globalThis.fetch = async () => { throw new Error("Verification regression prohibits network calls"); };
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const v = await import("../lib/staging-learning-verification");
  for (const env of [{}, { VERCEL_ENV: "production", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "staging" }, { VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "production", VERCEL_GIT_COMMIT_REF: "staging" }, { VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "main" }]) assert.throws(() => v.assertLearningVerificationEnvironment(env), /VERIFICATION_UNAVAILABLE/);
  Object.assign(process.env, { VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "staging" });
  const user = await db.user.create({ data: { clerkUserId: v.LEARNING_QA_USER, email: "staging-learning-regression@example.invalid", environment: "staging" } });
  const original = await db.workspace.create({ data: { userId: user.id, name: "Existing knowledge" } });
  const oldRule = await db.merchantRule.create({ data: { workspaceId: original.id, merchantKey: "old rule", normalizedName: "Do not change" } });
  const originalAccount = await db.account.create({ data: { workspaceId: original.id, name: "Confirmed foreign account", type: "bank", currency: "EUR", accountNumber: "000009876543", balance: "321.09" } });
  await db.accountStatementCheckpoint.create({ data: { id: "cmv29w3r4002806ictv6bmnfp", workspaceId: original.id, accountId: originalAccount.id, endingBalance: "321.09", status: "pending", sourceMetadata: { independentlyInvented: true, evidence: "Retained checkpoint" } } });
  const sourceEvidence = "Independently invented multi-page source evidence. ".repeat(2700);
  const originalDocument = await db.documentImport.create({ data: {
    workspaceId: original.id, documentFamily: "synthetic-regression", pageCount: 48,
    rawPayload: { independentlyInvented: true, sourceEvidence },
  } });
  await db.documentImportPage.createMany({ data: Array.from({ length: 48 }, (_, index) => ({
    documentImportId: originalDocument.id, pageNumber: index + 1, rawOcrText: sourceEvidence,
    rawPayload: { independentlyInvented: true, pageOccurrence: index, repeatedEvidence: "Keep each page" },
  })) });
  const originalJob = await db.learningJob.create({ data: {
    workspaceId: original.id, dedupeKey: "synthetic-retained-parent", source: "synthetic-regression",
    totalItems: 0, status: "completed", payload: { independentlyInvented: true, sourceEvidence },
  } });
  await db.learningJobAttempt.createMany({ data: Array.from({ length: 8 }, (_, index) => ({
    jobId: originalJob.id, attempt: index + 1, status: "completed", startIndex: 0, endIndex: 0,
    errorMessage: `Retained attempt ${index}: ${sourceEvidence}`,
  })) });
  const retainedRows = await Promise.all(Array.from({ length: 32 }, (_, index) => db.transaction.create({ data: {
    workspaceId: original.id, accountId: originalAccount.id, merchantRaw: "Repeated original merchant", merchantClean: "Confirmed edit",
    date: new Date("2026-09-14T12:00:00Z"), amount: "25.55", currency: "EUR", type: "expense", reviewStatus: "edited",
    rawPayload: { nativeRow: index, sourceDocumentText: sourceEvidence, confidence: 100, originalReference: `SYNTHETIC-${index}` },
  } })));
  const manifestTables = ["Workspace", "Account", "AccountTombstone", "Category", "Transaction", "ImportFile", "ParsedTransaction", "DocumentImport", "AccountStatementCheckpoint", "ReceiptDocument", "MerchantRule", "AccountRule", "TrainingSignal", "StatementTemplate", "DataQaRun", "DataQaFinding", "ImportFileExtractionCache", "ImportEnrichmentJob", "LearningJob", "DocumentImportPage", "LearningJobAttempt"];
  const financialTables = new Set(["Account", "AccountTombstone", "Transaction", "ImportFile", "ParsedTransaction", "DocumentImport", "AccountStatementCheckpoint", "ReceiptDocument", "DocumentImportPage"]);
  // Compatibility oracle: the previous released per-table PostgreSQL statement.
  // All complete rows, decimals, source JSON, timestamps and ownership predicates must match it exactly.
  const releasedManifest = async (tx: typeof db, checkpointId: string | null, excluded: string[], own = false) => {
    const result: Record<string, { count: number; sha256: string }> = {};
    for (const table of manifestTables.filter(table => checkpointId !== null || !own || financialTables.has(table))) {
      const expression = table === "Workspace" ? 't."id"' : table === "DocumentImportPage" ? '(SELECT p."workspaceId" FROM "DocumentImport" p WHERE p."id" = t."documentImportId")' : table === "LearningJobAttempt" ? '(SELECT j."workspaceId" FROM "LearningJob" j WHERE j."id" = t."jobId")' : 't."workspaceId"';
      const conditions: string[] = [], params: unknown[] = [];
      if (checkpointId !== null && table === "AccountStatementCheckpoint") { params.push(checkpointId); conditions.push('t."id" <> $1'); }
      if (checkpointId !== null && excluded.length) { params.push(excluded); conditions.push(`(${expression} IS NULL OR NOT (${expression} = ANY($${params.length}::text[])))`); }
      if (checkpointId === null) { params.push(excluded[0]); conditions.push(`${expression} ${own ? "=" : "<>"} $1`); }
      const rows = await tx.$queryRawUnsafe<Array<{ count: number; sha256: string }>>(`SELECT count(*)::int AS count, encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex'), '' ORDER BY t."id"), ''), 'UTF8')), 'hex') AS sha256 FROM "${table}" t ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}`, ...params);
      result[table] = rows[0];
    }
    return result;
  };
  const runId = randomUUID(), actor = "verification-regression";
  try {
    const start = await v.startLearningVerification(runId, actor);
    assert.deepEqual(await v.startLearningVerification(runId, actor), start, "Retry does not reset the baseline or create a Profile");
    await assert.rejects(v.startLearningVerification(runId, "another-admin"), /VERIFICATION_NOT_FOUND/);
    await assert.rejects(v.inspectLearningVerification(randomUUID(), actor), /VERIFICATION_NOT_FOUND/);
    const account = await db.account.create({ data: { workspaceId: start.workspaceId, name: "Test PHP", accountNumber: "0001", balance: 123, type: "bank" } });
    const category = await db.category.create({ data: { workspaceId: start.workspaceId, name: "Food", type: "expense" } });
    await db.transaction.create({ data: { workspaceId: start.workspaceId, accountId: account.id, categoryId: category.id, merchantRaw: "Retained fixture", date: new Date("2026-09-15"), amount: 25, type: "expense", reviewStatus: "edited", rawPayload: { evidence: "retained" } } });
    const legacyFile = await db.importFile.create({data:{workspaceId:start.workspaceId,fileName:"legacy-receipt.txt",fileType:"text/plain",storageKey:"qa/legacy"}});
    const legacyReceipt = await db.parsedTransaction.create({data:{workspaceId:start.workspaceId,importFileId:legacyFile.id,amount:"155.00",date:new Date("2022-09-07T05:06:22Z"),type:"expense",rawPayload:{source:"gcash_bills_receipt",line:"GCash Bills Pay Receipt\nAccount 09000000000\nAccount\nEX0AMPLE\nNumber",billerAccountNumber:null}}});
    const prepared = await v.prepareLearningVerificationCheckpoints(runId, actor);
    const report = await v.inspectLearningVerification(runId, actor);
    assert.deepEqual(report.changedOutsideProfile, []); assert.deepEqual(report.changedProtectedFinancial, []);
    assert.equal(report.retrievedSourceEvidence.find(row=>row.parsedRowId===legacyReceipt.id)?.billerAccountNumber,"EX0AMPLE");
    assert.deepEqual(await db.parsedTransaction.findUniqueOrThrow({where:{id:legacyReceipt.id}}),legacyReceipt,"Read-only source retrieval preserves every original field and timestamp");
    const failed = report.jobs.find(j => j.id === prepared.failureJobId)!;
    assert.equal(failed.errorCode, "CATEGORY_UNAVAILABLE"); assert.equal(failed.nextIndex, 1); assert.equal(failed.status, "failed");
    const interrupted = report.jobs.find(j => j.id === prepared.interruptionJobId)!;
    assert.equal(interrupted.nextIndex, 1); assert.equal(interrupted.status, "running"); assert(interrupted.lockedUntil! < new Date());
    assert.deepEqual(await v.prepareLearningVerificationCheckpoints(runId, actor), prepared);
    const { retryLearningJob } = await import("../lib/learning-jobs");
    await v.repairLearningVerificationReference(runId, actor);
    await retryLearningJob(failed.id, start.workspaceId); await retryLearningJob(interrupted.id, start.workspaceId);
    const finished = await v.inspectLearningVerification(runId, actor);
    assert(finished.jobs.every(j => j.status === "completed" && j.nextIndex === 3));
    assert(finished.jobs.some(j => j.runs.some(r => r.errorCode === "LEASE_EXPIRED")));
    const knowledge = JSON.stringify([finished.rules, finished.signals]);
    await Promise.all([retryLearningJob(failed.id, start.workspaceId), retryLearningJob(interrupted.id, start.workspaceId)]);
    const again = await v.inspectLearningVerification(runId, actor);
    assert.equal(JSON.stringify([again.rules, again.signals]), knowledge);
    assert.deepEqual(again.changedOutsideProfile, []); assert.deepEqual(again.changedProtectedFinancial, []);
    await db.merchantRule.update({ where: { id: oldRule.id }, data: { normalizedName: "Concurrent change" } });
    assert.deepEqual((await v.inspectLearningVerification(runId, actor)).changedOutsideProfile, ["MerchantRule"], "The baseline detects changes and never silently accepts a new baseline");
    const completeBaseline = await db.$transaction(tx => v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", tx, [start.workspaceId]));
    const secondRunId = randomUUID();
    const secondRun = await v.startLearningVerification(secondRunId, actor);
    for (const workspaceId of [start.workspaceId, secondRun.workspaceId]) {
      const document = await db.documentImport.create({ data: { workspaceId, documentFamily: "synthetic-regression", pageCount: 3 } });
      await db.documentImportPage.createMany({ data: Array.from({ length: 3 }, (_, index) => ({
        documentImportId: document.id, pageNumber: index + 1, rawOcrText: sourceEvidence,
        rawPayload: { independentlyInvented: true, repeatedOccurrence: index },
      })) });
      const job = await db.learningJob.create({ data: {
        workspaceId, dedupeKey: "synthetic-parent-scope", source: "synthetic-regression", totalItems: 0,
        status: "completed", payload: { independentlyInvented: true },
      } });
      await db.learningJobAttempt.create({ data: { jobId: job.id, attempt: 1, status: "completed", startIndex: 0, endIndex: 0 } });
    }
    for (const excluded of [[], [start.workspaceId], [start.workspaceId, secondRun.workspaceId]]) {
      assert.deepEqual(await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, excluded), await releasedManifest(db, "cmv29w3r4002806ictv6bmnfp", excluded), "Batched snapshot retains the released complete-row hashes for every exclusion set");
    }
    for (const workspaceId of [start.workspaceId, secondRun.workspaceId, original.id]) {
      for (const own of [false, true]) assert.deepEqual(await v.learningVerificationManifest(workspaceId, own, db), await releasedManifest(db, null, [workspaceId], own), "Financial-only and outside-Profile hashes retain every child occurrence and the exact released ownership semantics");
    }
    const parentScopeBefore = await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, [start.workspaceId, secondRun.workspaceId]);
    assert.equal(parentScopeBefore.DocumentImportPage.count, 48, "Exclude only both new QA parents; keep every retained page");
    assert.equal(parentScopeBefore.LearningJobAttempt.count, 8, "Keep every retained attempt independently of the new QA parents");
    await db.documentImport.update({ where: { id: originalDocument.id }, data: { institution: "Changed synthetic parent metadata" } });
    const changedParent = await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, [start.workspaceId, secondRun.workspaceId]);
    assert.deepEqual(changedParent.DocumentImportPage, parentScopeBefore.DocumentImportPage, "Parent fields do not enter the complete child-row hash");
    assert.notDeepEqual(changedParent.DocumentImport, parentScopeBefore.DocumentImport, "The complete parent-row hash still detects its own change");
    await db.documentImport.update({ where: { id: originalDocument.id }, data: { institution: originalDocument.institution, updatedAt: originalDocument.updatedAt } });
    const beforeRawEdit = await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, [start.workspaceId, secondRun.workspaceId]);
    await db.transaction.update({ where: { id: retainedRows[0].id }, data: { rawPayload: { nativeRow: 0, sourceDocumentText: sourceEvidence + " changed source evidence" }, updatedAt: retainedRows[0].updatedAt } });
    assert.notDeepEqual((await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, [start.workspaceId, secondRun.workspaceId])).Transaction, beforeRawEdit.Transaction, "The full preservation check detects source-only changes to confirmed records, even with unchanged amounts and identity");
    await db.transaction.update({ where: { id: retainedRows[0].id }, data: { rawPayload: retainedRows[0].rawPayload!, updatedAt: retainedRows[0].updatedAt } });
    assert.deepEqual(await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, [start.workspaceId, secondRun.workspaceId]), beforeRawEdit, "Restoring every fixture field restores the exact released manifest");
    await db.transaction.update({ where: { id: retainedRows[0].id }, data: { updatedAt: new Date(retainedRows[0].updatedAt.getTime() + 1000) } });
    assert.notDeepEqual((await v.checkpointPreservationManifest("cmv29w3r4002806ictv6bmnfp", db, [start.workspaceId, secondRun.workspaceId])).Transaction, beforeRawEdit.Transaction, "Timestamp-only changes remain visible to preservation checks");
    await db.transaction.update({ where: { id: retainedRows[0].id }, data: { updatedAt: retainedRows[0].updatedAt } });
    const batch = await v.previewLearningBatchPreservation([runId, secondRunId], actor);
    assert.deepEqual(batch.preservation, completeBaseline, "Exclude only newly allocated owned QA Profiles; retain all historical and null-Profile rows");
    await assert.rejects(v.previewLearningBatchPreservation([runId, secondRunId], "another-admin"), /VERIFICATION_NOT_FOUND/);
    for (const ids of [[], [runId,runId], [randomUUID()], Array.from({length:33},()=>randomUUID()), [original.id]]) await assert.rejects(v.previewLearningBatchPreservation(ids, actor), /VERIFICATION_NOT_FOUND/);
    await db.merchantRule.update({ where: { id: oldRule.id }, data: { normalizedName: "Another concurrent change" } });
    assert.notDeepEqual((await v.previewLearningBatchPreservation([runId, secondRunId], actor)).preservation.MerchantRule, completeBaseline.MerchantRule, "Aggregate checks detect edits to older rules");
    const require = createRequire(import.meta.url), adminPath = require.resolve("../lib/admin"), prior = require.cache[adminPath];
    let permission = "owner";
    require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { requireAdminAuth: async () => { if (permission === "anonymous") throw new Error("UNAUTHORIZED"); if (permission === "reader") throw new Error("FORBIDDEN"); return { userId: actor }; } } } as NodeModule;
    try {
      const route = await import("../app/api/admin/learning-verification/route");
      assert.equal(route.maxDuration, 300, "Complete staging snapshots retain enough request time without affecting parser or learning writes");
      const request = (body: unknown = { runId, action: "inspect" }, origin = "https://staging.clover.ph") => new Request("https://staging.clover.ph/api/admin/learning-verification", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
      permission = "anonymous"; assert.equal((await route.POST(request())).status, 401);
      permission = "reader"; assert.equal((await route.POST(request())).status, 403);
      permission = "owner"; assert.equal((await route.POST(request(undefined, "https://untrusted.invalid"))).status, 403);
      assert.equal((await route.POST(request({ runId, action: "inspect", workspaceId: original.id }))).status, 400);
      assert.equal((await route.POST(request({ runId, action: "repair-bpi-checkpoint" }))).status, 400, "A repair needs the reviewed preview hash");
      assert.equal((await route.POST(request({ runId, action: "preview-bpi-checkpoint", expectedPlanHash: "0".repeat(64) }))).status, 400);
      assert.equal((await route.POST(request({ runId, action: "preview-bpi-checkpoint" }))).status, 404, "Only the retained owned run can use this diagnostic");
      assert.equal((await route.POST(request({runId,action:"preview-batch-preservation",runIds:[runId,secondRunId]}))).status,200);
      assert.equal((await route.POST(request({runId,action:"preview-batch-preservation",runIds:[runId,runId]}))).status,400);
      assert.equal((await route.POST(request({runId,action:"preview-batch-preservation",runIds:[randomUUID()]}))).status,404);
      assert.equal((await route.POST(request({runId,action:"inspect",runIds:[runId]}))).status,400);
      assert.equal((await route.POST(request())).status, 200);
      process.env.VERCEL_ENV = "production"; assert.equal((await route.POST(request())).status, 404);
    } finally { if (prior) require.cache[adminPath] = prior; else delete require.cache[adminPath]; }
    console.log("PASS staging verification: production denied; authenticated operator and origin required; fixed QA ownership; retryable start; checkpoint failures and expired leases; no duplicate learning; financial and historical row hashes preserved; changes detected.");
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
