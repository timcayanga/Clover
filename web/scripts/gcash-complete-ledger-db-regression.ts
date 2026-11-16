import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { completeGcashStatement } from './gcash-complete-ledger-regression';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? '55441');
assert.equal(url.pathname, '/clover_migration_qa');
assert(process.argv.includes('--execute'));
const require = createRequire(import.meta.url);
require('next/cache').revalidateTag = () => {};
const tasks: Array<() => Promise<void>> = [];
require('next/server').after = (task: () => Promise<void>) => tasks.push(task);
const drain = async () => { while (tasks.length) await Promise.all(tasks.splice(0).map(task => task())); };
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('GCash complete-ledger regression prohibits network providers'); };

async function main() {
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const { processLearningJob } = await import('../lib/learning-jobs');
  const { AI_CONSENT_VERSION } = await import('../../shared/ai-consent');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: 'staging', planTier: 'pro', planTierLocked: true, appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Reviewed GCash complete ledger' } });
    const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'GCash Transaction History.pdf', fileType: 'application/pdf', storageKey: `qa/${randomUUID()}` } });
    const settle = async () => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId: workspace.id, status: 'queued' } })) await processLearningJob(job.id); };
    await processImportFileText(file.id, { text: completeGcashStatement, importMode: 'statement', actorUserId: user.clerkUserId });
    await settle();
    const account = await db.account.findFirstOrThrow({ where: { workspaceId: workspace.id, accountNumber: '09050000001' } });
    assert.equal(account.name, 'GCash 0001');
    assert.equal(account.institution, 'GCash');
    assert.equal(account.type, 'wallet');
    assert.equal(account.currency, 'PHP');
    assert.equal(Number(account.balance), 100);
    const parsed = await db.parsedTransaction.findMany({ where: { importFileId: file.id } });
    const transactions = await db.transaction.findMany({ where: { importFileId: file.id } });
    assert.equal(parsed.length, 6);
    assert.equal(transactions.length, 6);
    assert(transactions.every(row => row.accountId === account.id && row.currency === 'PHP'));
    assert.deepEqual(transactions.map(row => row.date.toISOString()).sort(), [7, 8, 9, 10, 11, 12].map(hour => `2026-08-${hour === 7 ? '09' : '10'}T${String((hour - 8 + 24) % 24).padStart(2, '0')}:02:00.000Z`).sort());
    assert(parsed.every(row => (row.rawPayload as Record<string, unknown>)?.completeNativeLedger === true));
    assert.deepEqual(parsed.map(row => row.date.toISOString()).sort(), transactions.map(row => row.date.toISOString()).sort(), 'Parsed source clocks must match normalized transaction clocks');
    const checkpoint = await db.accountStatementCheckpoint.findFirstOrThrow({ where: { importFileId: file.id } });
    assert.equal(Number(checkpoint.openingBalance), 100);
    assert.equal(Number(checkpoint.endingBalance), 100);
    assert.equal(checkpoint.mismatchReason, null);
    // Database row order is unspecified; compare every stored field in stable ID order.
    const snapshot = async () => JSON.stringify(await Promise.all([
      db.account.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
      db.transaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
      db.parsedTransaction.findMany({ where: { importFileId: file.id }, orderBy: { id: 'asc' } }),
      db.accountStatementCheckpoint.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
      db.learningJob.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
    ]));
    const before = await snapshot();
    await confirmImportFile(file.id);
    await settle();
    assert.deepEqual(JSON.parse(await snapshot()), JSON.parse(before), 'Repeated confirmation must be a complete no-op');
    const jobs = await db.learningJob.findMany({ where: { workspaceId: workspace.id } });
    assert.equal(jobs.length, 2);
    assert(jobs.every(job => job.status === 'completed'));
    await db.transaction.update({ where: { id: transactions[0].id }, data: { reviewStatus: 'edited', amount: '17.25', merchantClean: 'Confirmed correction' } });
    await db.account.update({ where: { id: account.id }, data: { name: 'My confirmed GCash', nameCustomized: true, balance: '543.21' } });
    const confirmed = await snapshot();
    await confirmImportFile(file.id);
    await settle();
    const afterConfirmed = await snapshot();
    const beforeParts = JSON.parse(confirmed) as Array<Array<Record<string, unknown>>>;
    const afterParts = JSON.parse(afterConfirmed) as Array<Array<Record<string, unknown>>>;
    for (let index = 0; index < 4; index++) {
      assert.deepEqual(afterParts[index], beforeParts[index], 'Confirmed edits, account identity, balance and source evidence must survive another confirmation');
    }
    assert(afterParts[4].length >= beforeParts[4].length, 'Confirmed correction must retain prior learning');
    assert(afterParts[4].every(job => job.status === 'completed'), 'Learning jobs must finish successfully');
    await confirmImportFile(file.id);
    await settle();
    const afterRepeatParts = JSON.parse(await snapshot()) as Array<Array<Record<string, unknown>>>;
    for (let index = 0; index < 4; index++) {
      assert.deepEqual(afterRepeatParts[index], afterParts[index], 'Settled confirmed correction must preserve financial rows');
    }
    assert.deepEqual(afterRepeatParts[4].map(job => [job.id, job.status]).sort(), afterParts[4].map(job => [job.id, job.status]).sort(), 'Settled confirmed correction must not enqueue duplicate learning');
  } finally {
    await drain();
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
  assert.equal(network, 0);
  console.log('GCash complete-ledger worker: account, clocks, balances, durable jobs and no-op confirmation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
