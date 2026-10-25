import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { eastwestProof } from './eastwest-transfer-proof-regression';
import { columnReceipt } from './receipt-column-settlement-regression';
import { SourceReviewRequiredError, SOURCE_REVIEW_PHASE } from '../lib/import-source-review';
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? '55441');
assert.equal(url.pathname, '/clover_migration_qa');
assert(process.argv.includes('--execute'));
const require = createRequire(import.meta.url);
require('next/cache').revalidateTag = () => {};
require('next/server').after = () => {};
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('Empty recovery regression prohibits providers'); };
async function main() {
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID()+'@example.invalid', environment: 'staging' } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Empty source recovery' } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: 'User confirmed account', type: 'bank', currency: 'PHP', balance: '123.45' } });
    const tx = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, date: new Date('2026-10-20'), amount: '30.25', currency: 'PHP', type: 'expense', merchantRaw: 'Confirmed lunch', reviewStatus: 'confirmed' } });
    const snapshot = async () => JSON.stringify([await db.account.findUniqueOrThrow({ where: { id: account.id } }), await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })]);
    const before = await snapshot();
    const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'unreadable-bank.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID() } });
    const execute = db.$executeRawUnsafe;
    const delayedWrites: Promise<unknown>[] = [];
    Object.assign(db, { $executeRawUnsafe: (query: string, ...values: unknown[]) => {
      const run = async () => {
        if (query.startsWith('UPDATE "ImportFile"') && values.includes('identifying_transactions')) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        return execute.call(db, query, ...values);
      };
      const write = run();
      if (values.includes('identifying_transactions')) delayedWrites.push(write);
      return write;
    } });
    const startedAt = performance.now();
    await assert.rejects(processImportFileText(file.id, { text: 'BANK ACCOUNT STATEMENT\nAccount number 12345678\nCurrency PHP\nOpening balance 100.00\nEnding balance 50.00\nTransaction records are unreadable', importMode: 'statement', skipVisualBackupParser: true, actorUserId: user.clerkUserId }), SourceReviewRequiredError);
    assert(performance.now() - startedAt < 10000, 'An empty import must terminate, not recurse for minutes');
    assert(delayedWrites.length > 0, 'Delayed progress race was actually exercised');
    await Promise.all(delayedWrites);
    Object.assign(db, { $executeRawUnsafe: execute });
    const stored = await db.importFile.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(stored.status, 'failed'); assert.equal(stored.processingPhase, SOURCE_REVIEW_PHASE);
    assert.equal(await db.auditLog.count({ where: { entityId: file.id, action: 'import.parser_usage' } }), 1, 'One processing request must mean one parser pass');
    assert.equal(await db.transaction.count({ where: { importFileId: file.id } }), 0);
    await assert.rejects(confirmImportFile(file.id), SourceReviewRequiredError);
    await assert.rejects(confirmImportFile(file.id), SourceReviewRequiredError);
    assert.equal(await db.auditLog.count({ where: { entityId: file.id, action: 'import.parser_usage' } }), 1, 'Repeated confirmation never restarts a terminal source');
    assert.equal(await snapshot(), before, 'Existing confirmed finance and account timestamps are untouched');
    const sender = await db.account.create({ data: { workspaceId: workspace.id, name: 'Confirmed EastWest source', nameCustomized: true, type: 'bank', institution: 'EastWest', accountNumber: '123456781234', currency: 'PHP', balance: '543.21' } });
    const senderBefore = JSON.stringify(sender);
    const proof = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'transfer.jpg', fileType: 'image/jpeg', storageKey: 'qa/'+randomUUID() } });
    await processImportFileText(proof.id, { text: eastwestProof, importMode: 'statement', skipVisualBackupParser: true, actorUserId: user.clerkUserId });
    const proofRows = await db.transaction.findMany({ where: { importFileId: proof.id } });
    assert.deepEqual(proofRows.map(row => Number(row.amount)).sort((a,b)=>a-b), [10,1250]);
    assert(proofRows.every(row => row.accountId === sender.id && row.reviewStatus !== 'confirmed'), 'The masked sender must match the existing source, with review retained');
    assert.equal(JSON.stringify(await db.account.findUniqueOrThrow({ where: { id: sender.id } })), senderBefore, 'A proof must not replace a confirmed sender identity or balance');
    await confirmImportFile(proof.id);
    assert.equal(await db.transaction.count({ where: { importFileId: proof.id } }), 2, 'Proof confirmation must be idempotent');
    assert.equal(await db.account.count({ where: { workspaceId: workspace.id, institution: 'UnionBank' } }), 0, 'A recipient is not a new user-owned bank account');
    assert.equal(await snapshot(), before);

    const { updateImportFileCompat } = await import('../lib/data-engine');
    for (const phase of ['complete', 'source_review_required', 'receipt_review_required', 'pause_requested', 'paused', 'cancel_requested', 'cancelled']) {
      const protectedFile = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'protected.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID(), status: phase === 'complete' ? 'done' : 'failed', processingPhase: phase, processingMessage: 'Existing authoritative state' } });
      const prior = JSON.stringify(protectedFile);
      await updateImportFileCompat(protectedFile.id, { status: 'processing', processingPhase: 'identifying_transactions', processingMessage: 'Late progress' }, { fetchUpdated: false, progressOnly: true });
      assert.equal(JSON.stringify(await db.importFile.findUniqueOrThrow({ where: { id: protectedFile.id } })), prior, phase+' must survive a late cosmetic update, including timestamps');
      assert.equal(await updateImportFileCompat(protectedFile.id, { processingPhase: 'reconciling' }, { progressOnly: true }), null, 'Returning progress writes use the same guard');
    }
    const { persistSourceReviewFailure } = await import('../lib/import-source-review.server');
    const { setImportUserControl } = await import('../lib/import-user-control');
    for (const phase of ['pause_requested', 'paused', 'cancel_requested', 'cancelled', 'complete']) {
      const protectedFile = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'late-refusal.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID(), status: phase === 'complete' ? 'done' : 'processing', processingPhase: phase } });
      const prior = await db.importFile.findUniqueOrThrow({where:{id:protectedFile.id}});
      const decision = await persistSourceReviewFailure(protectedFile.id, new SourceReviewRequiredError('Delayed native refusal'));
      assert.equal(decision?.kind, phase === 'complete' ? 'unavailable' : 'user_control');
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:protectedFile.id}}), prior, 'Late refusal preserves '+phase+' and timestamps');
    }
    const cancelled = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'abandoned-worker.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID(), status: 'processing', processingPhase: 'reading_file' } });
    await setImportUserControl(cancelled.id, user.clerkUserId, 'cancel');
    const cancelledBefore = await db.importFile.findUniqueOrThrow({where:{id:cancelled.id}});
    assert.equal(cancelledBefore.status, 'failed'); assert.equal(cancelledBefore.processingPhase, 'cancelled');
    await assert.rejects(confirmImportFile(cancelled.id), /Import cancelled/);
    await assert.rejects(setImportUserControl(cancelled.id, user.clerkUserId, 'resume'), /cancelled/);
    assert.equal(await db.transaction.count({where:{importFileId:cancelled.id}}), 0);
    assert.equal(await db.parsedTransaction.count({where:{importFileId:cancelled.id}}), 0);
    assert.equal(await db.auditLog.count({where:{entityId:cancelled.id,action:'import.user_control'}}), 1);
    // A cancellation committed between the refusal read and write wins the CAS.
    const racing = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'racing-refusal.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID(), status: 'processing', processingPhase: 'reading_file' } });
    const originalUpdateMany = db.importFile.updateMany;
    Object.assign(db.importFile, { updateMany: async (args: Parameters<typeof originalUpdateMany>[0]) => {
      if (args?.where?.id === racing.id && args.data.processingPhase === SOURCE_REVIEW_PHASE) {
        await setImportUserControl(racing.id, user.clerkUserId, 'cancel');
        // Simulate a same-millisecond timestamp collision; phase predicates still protect control.
        await db.importFile.update({where:{id:racing.id},data:{updatedAt:racing.updatedAt}});
      }
      return originalUpdateMany.call(db.importFile, args);
    } });
    try {
      assert.equal((await persistSourceReviewFailure(racing.id, new SourceReviewRequiredError('Racing refusal')))?.kind, 'unavailable');
    } finally { Object.assign(db.importFile, { updateMany: originalUpdateMany }); }
    const raceResult = await db.importFile.findUniqueOrThrow({where:{id:racing.id}});
    assert.equal(raceResult.status, 'failed'); assert.equal(raceResult.processingPhase, 'cancelled');
    assert.equal(await snapshot(), before, 'Cancellation and late refusal never change existing finance');

    const liveFile = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'live.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID(), status: 'processing', processingPhase: 'queued' } });
    await updateImportFileCompat(liveFile.id, { processingPhase: 'reading_file' }, { fetchUpdated: false, progressOnly: true });
    assert.equal((await db.importFile.findUniqueOrThrow({ where: { id: liveFile.id } })).processingPhase, 'reading_file');
    // State may change after a progress request starts, before its SQL runs.
    let release!: () => void; let entered!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { entered = resolve; });
    Object.assign(db, { $executeRawUnsafe: async (query: string, ...values: unknown[]) => {
      if (query.startsWith('UPDATE "ImportFile"') && values.includes('late_race')) { entered(); await hold; }
      return execute.call(db, query, ...values);
    } });
    const late = updateImportFileCompat(liveFile.id, { processingPhase: 'late_race', status: 'processing' }, { fetchUpdated: false, progressOnly: true });
    await reached;
    const completed = await db.importFile.update({ where: { id: liveFile.id }, data: { status: 'done', processingPhase: 'complete' } });
    release(); await late; Object.assign(db, { $executeRawUnsafe: execute });
    assert.equal(JSON.stringify(await db.importFile.findUniqueOrThrow({ where: { id: liveFile.id } })), JSON.stringify(completed));

    const columnFile = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'column-receipt.jpg', fileType: 'image/jpeg', storageKey: 'qa/'+randomUUID() } });
    await processImportFileText(columnFile.id, { text: columnReceipt, importMode: 'statement', skipVisualBackupParser: true, actorUserId: user.clerkUserId });
    const columnRows = await db.transaction.findMany({ where: { importFileId: columnFile.id } });
    assert.equal(columnRows.length, 1);
    assert.equal(Number(columnRows[0].amount), 250);
    assert.equal(columnRows[0].currency, 'PHP', 'Missing source currency uses the user default');
    assert.equal(columnRows[0].date.toISOString().slice(0,10), '2026-10-23');
    assert.equal((await db.importFile.findUniqueOrThrow({ where: { id: columnFile.id } })).status, 'done');
    await confirmImportFile(columnFile.id);
    assert.equal(await db.transaction.count({ where: { importFileId: columnFile.id } }), 1);
    assert.equal(await snapshot(), before);

    const noDate = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'incomplete-receipt.jpg', fileType: 'image/jpeg', storageKey: 'qa/'+randomUUID() } });
    const partial = await processImportFileText(noDate.id, { text: columnReceipt.replace('10/23/2026 05:25:13 PM\n',''), importMode: 'receipt', skipVisualBackupParser: true, actorUserId: user.clerkUserId });
    assert.equal(partial.requiresInput, true);
    const partialFile = await db.importFile.findUniqueOrThrow({ where: { id: noDate.id } });
    assert.equal(partialFile.status, 'failed');
    assert.equal(partialFile.processingPhase, 'receipt_review_required');
    assert.match(partialFile.processingMessage ?? '', /date/i);
    assert.equal(await db.transaction.count({ where: { importFileId: noDate.id } }), 0, 'A printer date cannot create a transaction');
    assert.equal(await snapshot(), before);

    // Confirmation invoked by a parser cannot re-enter the parser at all.
    const pending = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'pending.txt', fileType: 'text/plain', storageKey: 'qa/'+randomUUID() } });
    const result = await confirmImportFile(pending.id, null, { recoverMissingRows: false });
    assert.equal(result.status, 'staged');
    assert.equal(await db.auditLog.count({ where: { entityId: pending.id, action: 'import.parser_usage' } }), 0);
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
  assert.equal(network, 0);
  console.log('Empty import: one parser pass, terminal status, bounded confirmation and protected existing records passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
