import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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
    const startedAt = performance.now();
    await assert.rejects(processImportFileText(file.id, { text: 'BANK ACCOUNT STATEMENT\nAccount number 12345678\nCurrency PHP\nOpening balance 100.00\nEnding balance 50.00\nTransaction records are unreadable', importMode: 'statement', skipVisualBackupParser: true, actorUserId: user.clerkUserId }), SourceReviewRequiredError);
    assert(performance.now() - startedAt < 10000, 'An empty import must terminate, not recurse for minutes');
    const stored = await db.importFile.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(stored.status, 'failed'); assert.equal(stored.processingPhase, SOURCE_REVIEW_PHASE);
    assert.equal(await db.auditLog.count({ where: { entityId: file.id, action: 'import.parser_usage' } }), 1, 'One processing request must mean one parser pass');
    assert.equal(await db.transaction.count({ where: { importFileId: file.id } }), 0);
    await assert.rejects(confirmImportFile(file.id), SourceReviewRequiredError);
    await assert.rejects(confirmImportFile(file.id), SourceReviewRequiredError);
    assert.equal(await db.auditLog.count({ where: { entityId: file.id, action: 'import.parser_usage' } }), 1, 'Repeated confirmation never restarts a terminal source');
    assert.equal(await snapshot(), before, 'Existing confirmed finance and account timestamps are untouched');
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
