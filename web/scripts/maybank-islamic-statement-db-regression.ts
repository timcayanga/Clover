import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { completeMaybankStatement } from './maybank-islamic-statement-regression';

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
globalThis.fetch = async () => { network++; throw new Error('Maybank Islamic native regression prohibits network providers'); };

async function main() {
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const { processLearningJob } = await import('../lib/learning-jobs');
  const { AI_CONSENT_VERSION } = await import('../../shared/ai-consent');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: 'staging', planTier: 'pro', planTierLocked: true, appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Reviewed Maybank Islamic statement' } });
    const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'Maybank Islamic Statement.pdf', fileType: 'application/pdf', storageKey: `qa/${randomUUID()}` } });
    const settle = async () => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId: workspace.id, status: 'queued' } })) await processLearningJob(job.id); };
    await processImportFileText(file.id, { text: completeMaybankStatement, importMode: 'statement', actorUserId: user.clerkUserId });
    await settle();
    const account = await db.account.findFirstOrThrow({ where: { workspaceId: workspace.id, accountNumber: '123456-789012' } });
    assert.equal(account.name, 'Maybank 9012');
    assert.equal(account.institution, 'Maybank Islamic');
    assert.equal(account.type, 'bank');
    assert.equal(account.currency, 'MYR');
    assert.equal(Number(account.balance), 115);
    const parsed = await db.parsedTransaction.findMany({ where: { importFileId: file.id } });
    const transactions = await db.transaction.findMany({ where: { importFileId: file.id } });
    assert.equal(parsed.length, 5);
    assert.equal(transactions.length, 5);
    assert(transactions.every(row => row.accountId === account.id && row.currency === 'MYR'));
    assert.equal(transactions.filter(row => Number(row.amount) === 10 && row.merchantRaw.includes('SALE DEBIT')).length, 2, 'Legitimate repeated purchases must survive');
    assert.equal(transactions.filter(row => row.description === 'SALE DEBIT COFFEE SHOP *').length, 2, 'Full raw source descriptions must survive normalization');
    assert(parsed.every(row => (row.rawPayload as Record<string, unknown>)?.source === 'maybank_islamic_native'));
    const checkpoint = await db.accountStatementCheckpoint.findFirstOrThrow({ where: { importFileId: file.id } });
    assert.equal(Number(checkpoint.openingBalance), 100);
    assert.equal(Number(checkpoint.endingBalance), 115);
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
    assert.deepEqual(JSON.parse(await snapshot()), JSON.parse(before), 'Repeat confirmation must preserve all stored fields and timestamps');
    const jobs = await db.learningJob.findMany({ where: { workspaceId: workspace.id } });
    assert.equal(jobs.length, 2);
    assert(jobs.every(job => job.status === 'completed'));
    await db.transaction.update({ where: { id: transactions[0].id }, data: { reviewStatus: 'edited', amount: '17.25', merchantClean: 'Confirmed correction' } });
    await db.account.update({ where: { id: account.id }, data: { name: 'My confirmed Maybank', nameCustomized: true, balance: '543.21' } });
    const confirmed = await snapshot();
    await confirmImportFile(file.id);
    await settle();
    assert.deepEqual(JSON.parse(await snapshot()), JSON.parse(confirmed), 'Historical statement must not replace confirmed edits, current balance or account identity');
  } finally {
    await drain();
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
  assert.equal(network, 0);
  console.log('Maybank Islamic native worker: 5 rows, repeats, MYR bank identity, balances, jobs and confirmed-data preservation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
