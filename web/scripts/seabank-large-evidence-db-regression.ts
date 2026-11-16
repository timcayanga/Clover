import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { completeLargeSeaBankLedger } from './seabank-large-evidence-regression';

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
globalThis.fetch = async () => { network++; throw new Error('Large SeaBank evidence regression prohibits network providers'); };

async function main() {
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const { processLearningJob } = await import('../lib/learning-jobs');
  const { AI_CONSENT_VERSION } = await import('../../shared/ai-consent');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: 'staging', planTier: 'pro', planTierLocked: true, appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Reviewed large SeaBank ledger' } });
    const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'SeaBank ID Large Statement.pdf', fileType: 'application/pdf', storageKey: `qa/${randomUUID()}` } });
    const settle = async () => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId: workspace.id, status: 'queued' } })) await processLearningJob(job.id); };
    await processImportFileText(file.id, { text: completeLargeSeaBankLedger, importMode: 'statement', actorUserId: user.clerkUserId });
    await settle();
    const account = await db.account.findFirstOrThrow({ where: { workspaceId: workspace.id, accountNumber: '901000000123' } });
    assert.equal(account.institution, 'SeaBank Indonesia');
    assert.equal(account.type, 'bank');
    assert.equal(account.currency, 'IDR');
    assert.equal(Number(account.balance), 100);
    const parsed = await db.parsedTransaction.findMany({ where: { importFileId: file.id } });
    const transactions = await db.transaction.findMany({ where: { importFileId: file.id } });
    assert.equal(parsed.length, 200);
    assert.equal(transactions.length, 200);
    assert.equal(parsed.filter(row => (row.rawPayload as Record<string, unknown>).sourceDocumentText === completeLargeSeaBankLedger).length, 1);
    assert.equal(transactions.filter(row => (row.rawPayload as Record<string, unknown>).sourceDocumentText === completeLargeSeaBankLedger).length, 1);
    assert(parsed.every(row => typeof (row.rawPayload as Record<string, unknown>).line === 'string'));
    assert(transactions.every(row => row.accountId === account.id && row.currency === 'IDR'));
    const checkpoint = await db.accountStatementCheckpoint.findFirstOrThrow({ where: { importFileId: file.id } });
    assert.equal(Number(checkpoint.openingBalance), 100);
    assert.equal(Number(checkpoint.endingBalance), 100);
    assert.equal(checkpoint.mismatchReason, null);
    // PostgreSQL does not guarantee row order; retain all fields in stable ID order.
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
    assert.deepEqual(JSON.parse(await snapshot()), JSON.parse(before), 'Repeat confirmation must preserve every row and timestamp');
    const jobs = await db.learningJob.findMany({ where: { workspaceId: workspace.id } });
    assert.equal(jobs.length, 2);
    assert(jobs.every(job => job.status === 'completed'));
    await db.transaction.update({ where: { id: transactions[0].id }, data: { reviewStatus: 'edited', amount: '7', merchantClean: 'Confirmed correction' } });
    await db.account.update({ where: { id: account.id }, data: { name: 'My confirmed SeaBank', nameCustomized: true, balance: '543.21' } });
    const confirmed = await snapshot();
    await confirmImportFile(file.id);
    await settle();
    assert.deepEqual(JSON.parse(await snapshot()), JSON.parse(confirmed), 'Historical import must preserve confirmed edit and current account balance');
  } finally {
    await drain();
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
  assert.equal(network, 0);
  console.log('Large SeaBank worker: 200 rows, one full transcript, durable jobs, no-op retry and confirmed-data preservation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
