import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);
require("next/cache").revalidateTag = () => {};
require("next/server").after = () => {};
let network = 0;
globalThis.fetch = async () => { network++; throw new Error("Attempt QA prohibits providers"); };

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { claimImportAttempt, finishImportAttempt, withImportAttempt, assertImportAttemptCurrent,
    observeImportTransactionAvailability, hasActiveImportAttempt, ImportAttemptLostError, IMPORT_ATTEMPT_ACTION } = await import("../lib/import-attempts");
  const { queueStaleEmptyImportRecovery, recoverFailedImportResume } = await import("../lib/import-resume-recovery");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID()+"@example.invalid", environment: "staging" } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Attempts QA" } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: "Confirmed account", type: "bank", currency: "PHP", balance: "321.09" } });
    const confirmed = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, date: new Date("2026-10-01"),
      merchantRaw: "Private merchant must not enter metrics", type: "expense", amount: "14.25", currency: "PHP", reviewStatus: "confirmed" } });
    const classification = await db.importFile.create({ data: {
      workspaceId: workspace.id, fileName: "coupon.png", fileType: "image/png", storageKey: "qa/coupon",
      status: "processing", processingPhase: "reading_account_details", updatedAt: new Date(0),
    } });
    const reader = (await claimImportAttempt(classification.id))!;
    assert(reader);
    const [poll, recovery, resume] = await Promise.all([
      queueStaleEmptyImportRecovery(classification.id, classification.updatedAt, { expectedStatus: "processing", nextAttempt: 1 }),
      recoverFailedImportResume(classification.id, classification.updatedAt),
      claimImportAttempt(classification.id),
    ]);
    assert.equal(poll, false);
    assert.deepEqual(recovery, { kind: "preserved" });
    assert.equal(resume, null);
    assert.equal(await hasActiveImportAttempt(workspace.id, classification.id), true);
    assert.deepEqual(await db.importFile.findUniqueOrThrow({ where: { id: classification.id } }), classification);
    await finishImportAttempt(reader, true, "Standalone coupon (I-108-PROMOTION)");
    assert.equal((await db.importFile.findUniqueOrThrow({ where: { id: classification.id } })).processingPhase, "non_financial");
    assert.equal(await claimImportAttempt(classification.id), null, "A late resume cannot reopen a classified rejection");
    assert.equal(await db.auditLog.count({ where: { entityId: classification.id, action: IMPORT_ATTEMPT_ACTION } }), 1);
    const financialBefore = JSON.stringify([account, confirmed]);
    const { prepareImportDispatch, reserveDelayedImportDispatch, readImportDispatch, IMPORT_DISPATCH_DELAY_MS } = await import("../lib/import-dispatch");
    const dispatchFile = await db.importFile.create({ data: {
      workspaceId: workspace.id, fileName: "dispatch.pdf", fileType: "application/pdf", storageKey: "qa/saved-dispatch",
    } });
    const options = { importId: dispatchFile.id, workspaceId: workspace.id, actorUserId: user.clerkUserId,
      message: "Queued", importMode: "statement" as const, allowDuplicateStatement: false };
    const [dispatchId, reusedDispatchId] = await Promise.all([prepareImportDispatch(options), prepareImportDispatch(options)]);
    assert(dispatchId && dispatchId === reusedDispatchId);
    assert.equal(await reserveDelayedImportDispatch(dispatchFile.id, workspace.id), null, "Fresh requests cannot be redelivered early");
    const entry = (await readImportDispatch(db, dispatchFile.id, workspace.id))!;
    assert.equal(entry.data.id, dispatchId);
    await db.auditLog.update({ where: { id: entry.row.id }, data: {
      metadata: { ...entry.data, queuedAt: new Date(Date.now() - IMPORT_DISPATCH_DELAY_MS - 1000).toISOString() },
    } });
    const reservations = await Promise.all([
      reserveDelayedImportDispatch(dispatchFile.id, workspace.id),
      reserveDelayedImportDispatch(dispatchFile.id, workspace.id),
      reserveDelayedImportDispatch(dispatchFile.id, "another-workspace"),
    ]);
    assert.equal(reservations.filter(Boolean).length, 1, "Only one poll or sweep can schedule a delayed recovery");
    const redeliveries = await Promise.all([
      claimImportAttempt(dispatchFile.id, null, null, undefined, { id: dispatchId, source: "status_recovery" }),
      claimImportAttempt(dispatchFile.id, null, null, undefined, { id: dispatchId, source: "post_response" }),
      claimImportAttempt(dispatchFile.id, null, null, undefined, { id: "superseded", source: "bullmq" }),
    ]);
    const dispatchWinner = redeliveries.find(Boolean)!;
    assert.equal(redeliveries.filter(Boolean).length, 1);
    const finishedDispatch = await finishImportAttempt(dispatchWinner, false);
    assert.equal(finishedDispatch?.dispatchId, dispatchId);
    assert(finishedDispatch!.dispatchWaitMs! >= IMPORT_DISPATCH_DELAY_MS);
    assert.equal(finishedDispatch?.pdfQueueWaitMs, finishedDispatch?.dispatchWaitMs);
    assert.equal(await claimImportAttempt(dispatchFile.id, null, null, undefined, { id: dispatchId, source: "bullmq" }), null,
      "A delayed broker duplicate cannot start a new attempt after the winning lease ends");
    assert.equal(await db.auditLog.count({ where: { entityId: dispatchFile.id, action: IMPORT_ATTEMPT_ACTION } }), 1);
    const waitingPdf = await db.importFile.create({ data: {
      workspaceId: workspace.id, fileName: "lock-test.pdf", fileType: "application/pdf", storageKey: "qa/lock-test",
    } });
    let lockAcquired!: () => void;
    const lockReady = new Promise<void>(resolve => { lockAcquired = resolve; });
    let releaseLock!: () => void;
    const lockRelease = new Promise<void>(resolve => { releaseLock = resolve; });
    const blockingTransaction = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${waitingPdf.id} FOR UPDATE`;
      lockAcquired();
      await lockRelease;
    });
    await Promise.race([lockReady, blockingTransaction]);
    const claimWaiting = claimImportAttempt(waitingPdf.id, user.clerkUserId, 375, "qa-queued-pdf");
    await new Promise(resolve => setTimeout(resolve, 120));
    releaseLock();
    await blockingTransaction;
    const waited = await claimWaiting;
    assert(waited);
    const { recordPdfModelUsage } = await import("../lib/import-timing");
    const timedAttempt = await withImportAttempt(waited, async () => {
      recordPdfModelUsage(waitingPdf.id, { inputTokens: 7, outputTokens: 3, totalTokens: 10, durationMs: 30 });
      recordPdfModelUsage(waitingPdf.id, { inputTokens: 11, outputTokens: 5, totalTokens: 16, durationMs: 80 });
      return finishImportAttempt(waited, false);
    });
    assert.deepEqual(timedAttempt?.pdfModelUsage, {
      callsWithReportedUsage: 2, inputTokens: 18, outputTokens: 8, totalTokens: 26, slowestCallMs: 80,
    });
    assert.equal(timedAttempt?.pdfQueueWaitMs, 375);
    assert(timedAttempt.pdfClaimRowLockMs! >= 60, "Contended row lock is measured after opening the transaction");
    assert(timedAttempt.pdfWorkerClaimMs! >= timedAttempt.pdfClaimRowLockMs!);
    assert(timedAttempt.pdfClaimPoolWaitMs! < timedAttempt.pdfClaimRowLockMs!, "Row lock time is not attributed to pool wait");
    const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "private-customer-name.jpg", fileType: "image/jpeg", storageKey: "private-secret-path", uploadedAt: new Date(Date.now()-2000) } });
    const claims = await Promise.all([claimImportAttempt(file.id), claimImportAttempt(file.id), claimImportAttempt(file.id)]);
    const first = claims.find(Boolean)!;
    assert.equal(claims.filter(Boolean).length, 1, "Competing HTTP/cron/queue callers get one durable claim");
    assert.equal(first.attempt.attemptNumber, 1);
    assert.equal(await db.auditLog.count({ where: { entityId: file.id, action: IMPORT_ATTEMPT_ACTION } }), 1);
    await withImportAttempt(first, () => assertImportAttemptCurrent(file.id));
    await db.importFile.update({ where: { id: file.id }, data: { status: "failed", processingPhase: "repair_needed" } });
    const failed = await finishImportAttempt(first, true);
    assert.equal(failed?.outcome, "failed");
    assert.equal(failed?.uploadToTransactionAvailableMs, null, "Failures cannot enter success-only latency");
    assert(failed!.uploadToOutcomeMs! >= 2000);
    assert.equal(await finishImportAttempt(first, true), null, "Outcome emission is repeat-safe");
    const second = (await claimImportAttempt(file.id))!;
    assert.equal(second.attempt.attemptNumber, 2, "Retry does not reset the first-attempt denominator");
    await withImportAttempt(first, async () => {
      await assert.rejects(assertImportAttemptCurrent(file.id), ImportAttemptLostError);
      await assert.rejects(db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${file.id} FOR UPDATE`;
        await assertImportAttemptCurrent(file.id, tx);
      }), ImportAttemptLostError, "Old invocation cannot pass the financial-commit fence");
    });
    const expired = { ...second.attempt, leaseExpiresAt: new Date(Date.now()-1).toISOString() };
    await db.auditLog.update({ where: { id: second.recordId }, data: { metadata: expired } });
    const third = (await claimImportAttempt(file.id))!;
    assert.equal(third.attempt.attemptNumber, 3);
    assert.equal(((await db.auditLog.findUniqueOrThrow({where:{id:second.recordId}})).metadata as Record<string,unknown>)?.outcome, "interrupted");
    assert.equal(await finishImportAttempt(second, true), null, "Late finish cannot overwrite interrupted outcome");
    await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, importFileId: file.id,
      date: new Date("2026-10-02"), amount: "20.25", currency: "PHP", merchantRaw: "Synthetic receipt", type: "expense", reviewStatus: "pending_review", deletedAt: new Date() } });
    const success = await finishImportAttempt(third, false);
    assert.equal(success?.outcome, "transaction_available", "Retained/deleted saved evidence is not reported as extraction failure");
    assert(success!.uploadToTransactionAvailableMs! >= 2000);
    const partialRecovery = await claimImportAttempt(file.id);
    assert(partialRecovery,"Existing rows alone must not suppress recovery of an operation that never reached the complete phase");
    await finishImportAttempt(partialRecovery,false);
    const metadata = JSON.stringify((await db.auditLog.findMany({ where: { entityId: file.id, action: IMPORT_ATTEMPT_ACTION } })).map(x=>x.metadata));
    for (const privateValue of [file.fileName, file.storageKey, confirmed.merchantRaw, "321.09"]) assert(!metadata.includes(privateValue), "No source or financial details in metrics");
    const legacy = await db.importFile.create({data:{workspaceId:workspace.id,fileName:"legacy.txt",fileType:"text/plain",storageKey:"legacy",status:"failed"}});
    const legacyClaim = (await claimImportAttempt(legacy.id))!;
    assert.equal(legacyClaim.attempt.historicalAttemptsUnknown, true, "Legacy retries must not masquerade as newly measured first attempts");
    await finishImportAttempt(legacyClaim,true);
    const held = await db.importFile.create({data:{workspaceId:workspace.id,fileName:"held.txt",fileType:"text/plain",storageKey:"held",status:"failed",processingPhase:"source_review_required",processingMessage:"Source arithmetic requires review"}});
    await assert.rejects(claimImportAttempt(held.id), /Source arithmetic requires review/);
    assert.equal(await db.auditLog.count({where:{entityId:held.id,action:IMPORT_ATTEMPT_ACTION}}),0,"Unchanged terminal sources never start another extraction");
    // Exercise the actual worker handoff, not only the claim helper. Keep the
    // original source upload pending while a second entry point races it.
    const { processImportFileText } = await import("../workers/import-processor");
    const source = readFileSync(new URL("./fixtures/reviewed-parser-corpus/repeated-and-multicurrency.csv", import.meta.url), "utf8");
    const racing = await db.importFile.create({data:{workspaceId:workspace.id,fileName:"concurrent.csv",fileType:"text/csv",storageKey:"qa/"+randomUUID()}});
    let release!: () => void;
    let reached!: () => void;
    const reachedStorage = new Promise<void>(resolve => { reached = resolve; });
    const storage = new Promise<void>(resolve => { release = resolve; });
    const rawFileReady = { then(resolve: () => void) { reached(); return storage.then(resolve); }, catch() { return Promise.resolve(); } } as unknown as Promise<void>;
    const firstWorker = processImportFileText(racing.id,{text:source,sourceBytes:new TextEncoder().encode(source),importMode:"statement",rawFileReady});
    await reachedStorage;
    try {
      assert.equal(await db.parsedTransaction.count({ where: { importFileId: racing.id } }), 0);
      assert.equal(await db.transaction.count({ where: { importFileId: racing.id } }), 0);
      const concurrent = await processImportFileText(racing.id,{text:source,importMode:"statement"});
      assert.equal(concurrent.status,"staged");
      assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:IMPORT_ATTEMPT_ACTION}}),1);
    } finally { release(); }
    await firstWorker;
    assert.equal(await db.transaction.count({where:{importFileId:racing.id}}),3,"Concurrent request cannot create extra source occurrences");
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:"import.parser_usage"}}),1,"Only the claimed worker invokes the parser");
    const completedFinance = JSON.stringify(await db.transaction.findMany({where:{importFileId:racing.id},orderBy:{id:"asc"}}));
    await processImportFileText(racing.id,{text:source,importMode:"statement"});
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:"import.parser_usage"}}),1,"A late duplicate after completion must not parse again");
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:IMPORT_ATTEMPT_ACTION}}),1,"A no-op completed request must not inflate retry metrics");
    await db.importFile.update({where:{id:racing.id},data:{status:"processing",processingPhase:"uploading",processingMessage:"Late overlapping request preparation"}});
    await processImportFileText(racing.id,{text:source,importMode:"statement"});
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:"import.parser_usage"}}),1,"Late preparation cannot reopen a completed extraction");
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:IMPORT_ATTEMPT_ACTION}}),1);
    const completedState = await db.importFile.findUniqueOrThrow({where:{id:racing.id}});
    assert.equal(completedState.status,"done"); assert.equal(completedState.processingPhase,"complete");
    assert.equal(JSON.stringify(await db.transaction.findMany({where:{importFileId:racing.id},orderBy:{id:"asc"}})),completedFinance,"Late duplicates cannot mutate saved finance");
    const observed = await db.auditLog.findFirstOrThrow({where:{entityId:racing.id,action:IMPORT_ATTEMPT_ACTION}});
    assert((observed.metadata as Record<string,unknown>).transactionObservedAt,"Actual confirmation records committed availability");
    await observeImportTransactionAvailability(racing.id);
    assert.deepEqual((await db.auditLog.findUniqueOrThrow({where:{id:observed.id}})).metadata,observed.metadata,"Repeated observation retains the first clock and outcome");
    await db.transaction.deleteMany({where:{importFileId:racing.id}});
    await processImportFileText(racing.id,{text:source,importMode:"statement"});
    assert.equal(await db.transaction.count({where:{importFileId:racing.id}}),0,"Completed duplicate requests cannot resurrect subsequently deleted finance");
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:"import.parser_usage"}}),1);
    assert.deepEqual((await db.auditLog.findUniqueOrThrow({where:{id:observed.id}})).metadata,observed.metadata,"Historical availability survives deletion without a fabricated new timing");
    assert.equal(JSON.stringify([await db.account.findUniqueOrThrow({where:{id:account.id}}),await db.transaction.findUniqueOrThrow({where:{id:confirmed.id}})]),financialBefore);
    assert.equal(network,0);
    console.log("Import attempts: concurrent single claim, durable failure timing, retry identity, interruption, stale-worker fence, deleted-record safety and privacy passed.");
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
