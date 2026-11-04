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
    observeImportTransactionAvailability, ImportAttemptLostError, IMPORT_ATTEMPT_ACTION } = await import("../lib/import-attempts");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID()+"@example.invalid", environment: "staging" } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Attempts QA" } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: "Confirmed account", type: "bank", currency: "PHP", balance: "321.09" } });
    const confirmed = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, date: new Date("2026-10-01"),
      merchantRaw: "Private merchant must not enter metrics", type: "expense", amount: "14.25", currency: "PHP", reviewStatus: "confirmed" } });
    const financialBefore = JSON.stringify([account, confirmed]);
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
    const firstWorker = processImportFileText(racing.id,{text:source,importMode:"statement",rawFileReady});
    await reachedStorage;
    try {
      const concurrent = await processImportFileText(racing.id,{text:source,importMode:"statement"});
      assert.equal(concurrent.status,"staged");
      assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:IMPORT_ATTEMPT_ACTION}}),1);
    } finally { release(); }
    await firstWorker;
    assert.equal(await db.transaction.count({where:{importFileId:racing.id}}),3,"Concurrent request cannot create extra source occurrences");
    assert.equal(await db.auditLog.count({where:{entityId:racing.id,action:"import.parser_usage"}}),1,"Only the claimed worker invokes the parser");
    const observed = await db.auditLog.findFirstOrThrow({where:{entityId:racing.id,action:IMPORT_ATTEMPT_ACTION}});
    assert((observed.metadata as Record<string,unknown>).transactionObservedAt,"Actual confirmation records committed availability");
    await observeImportTransactionAvailability(racing.id);
    assert.deepEqual((await db.auditLog.findUniqueOrThrow({where:{id:observed.id}})).metadata,observed.metadata,"Repeated observation retains the first clock and outcome");
    assert.equal(JSON.stringify([await db.account.findUniqueOrThrow({where:{id:account.id}}),await db.transaction.findUniqueOrThrow({where:{id:confirmed.id}})]),financialBefore);
    assert.equal(network,0);
    console.log("Import attempts: concurrent single claim, durable failure timing, retry identity, interruption, stale-worker fence, deleted-record safety and privacy passed.");
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
