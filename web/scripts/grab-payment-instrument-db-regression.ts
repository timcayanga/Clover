import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseGrabEmailReceipt, getGrabPaymentInstrumentSuffix, GRAB_PAYMENT_ACCOUNT_REVIEW_PHASE } from '../lib/grab-email-receipt';
import { isSourceReviewRequiredError } from '../lib/import-source-review';

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
globalThis.fetch = async () => { network++; throw new Error('Payment-reference QA forbids provider calls'); };

async function main() {
  const text = readFileSync('scripts/fixtures/reviewed-parser-corpus/grab-unspecified-instrument.txt', 'utf8');
  const parsed = parseGrabEmailReceipt(text)!;
  assert.equal(getGrabPaymentInstrumentSuffix(parsed.rows), '4821');
  assert.equal(parsed.metadata.accountNumber, null);
  assert.equal(parsed.metadata.accountType, null);
  assert.equal(parsed.metadata.institution, null);
  for (const bad of [text.replace('4821 145.00', '4821 144.00'), text.replace('4821 145.00', '4821 145.00\\n4822 145.00'), text.replace('4821 145.00', '4821'), text.replace('4821 145.00', '12345678 145.00'), text.replace('Fare 125.00', 'Fare 126.00')]) {
    assert.throws(() => parseGrabEmailReceipt(bad), isSourceReviewRequiredError);
  }
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const { processLearningJob, retryLearningJob } = await import('../lib/learning-jobs');
  const { loadImportStatusSnapshot } = await import('../lib/import-status-snapshot');
  const { AI_CONSENT_VERSION } = await import('../../shared/ai-consent');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID() + '@example.invalid', environment: 'staging', planTier: 'pro', planTierLocked: true,
    appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  const settle = async (workspaceId: string) => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId, status: 'queued' } })) { if (await db.importFile.count({ where: { workspaceId, status: 'done' } })) await retryLearningJob(job.id, workspaceId); await processLearningJob(job.id); } };
  try {
    for (const importMode of ['statement', 'receipt'] as const) {
      const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Reviewed payment reference ' + importMode } });
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'invented-payment-reference.pdf', fileType: 'application/pdf', storageKey: 'qa/' + randomUUID() } });
      const result = await processImportFileText(file.id, { text, importMode, actorUserId: user.clerkUserId });
      await settle(workspace.id);
      assert.equal(result.requiresInput, true);
      assert.equal(await db.account.count({ where: { workspaceId: workspace.id } }), 0, 'Unknown payment cannot create Cash, wallet or an invented issuer');
      assert.equal(await db.transaction.count({ where: { workspaceId: workspace.id } }), 0);
      assert.equal(await db.parsedTransaction.count({ where: { importFileId: file.id } }), 1);
      assert.equal((await db.importFile.findUniqueOrThrow({ where: { id: file.id } })).processingPhase, GRAB_PAYMENT_ACCOUNT_REVIEW_PHASE);
      assert.equal(await db.trainingSignal.count({ where: { workspaceId: workspace.id } }), 0, 'Unselected account cannot become a learned financial observation');
      await assert.rejects(confirmImportFile(file.id), /Select the existing payment account/);

      const card = await db.account.create({ data: { workspaceId: workspace.id, name: 'My confirmed card', nameCustomized: true, institution: 'Example Bank', institutionCustomized: true,
        accountNumber: '000000004821', importIdentityAccountNumber: '000000004821', type: 'credit_card', currency: 'PHP', source: 'manual', balance: '765.43' } });
      const prior = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: card.id, date: new Date('2026-01-01T12:00:00Z'), amount: '97.25', currency: 'PHP', type: 'expense',
        merchantRaw: 'Original manual evidence', merchantClean: 'Confirmed correction', description: 'Keep this financial record', reviewStatus: 'edited', isExcluded: true, rawPayload: { source: 'manual', original: 'untouched' } } });
      const wrongCurrency = await db.account.create({ data: { workspaceId: workspace.id, name: 'USD card', accountNumber: '4821', type: 'credit_card', currency: 'USD', balance: '12.34' } });
      const wrongSuffix = await db.account.create({ data: { workspaceId: workspace.id, name: 'Other card', accountNumber: '4822', type: 'credit_card', currency: 'PHP', balance: '23.45' } });
      const wrongType = await db.account.create({ data: { workspaceId: workspace.id, name: 'Wallet', accountNumber: '4821', type: 'wallet', currency: 'PHP', balance: '34.56' } });
      const other = await db.workspace.create({ data: { userId: user.id, name: 'Other Profile' } });
      const foreign = await db.account.create({ data: { workspaceId: other.id, name: 'Other Profile card', accountNumber: '4821', type: 'credit_card', currency: 'PHP', balance: '45.67' } });
      const accountsBefore = await db.account.findMany({ where: { workspace: { userId: user.id } }, orderBy: { id: 'asc' } });
      for (const bad of [wrongCurrency.id, wrongSuffix.id, wrongType.id, foreign.id]) await assert.rejects(confirmImportFile(file.id, bad), /existing same-currency/);
      assert.equal(await db.transaction.count({ where: { importFileId: file.id } }), 0);
      assert.deepEqual(await db.account.findMany({ where: { workspace: { userId: user.id } }, orderBy: { id: 'asc' } }), accountsBefore);

      await confirmImportFile(file.id, card.id); await settle(workspace.id);
      const saved = await db.transaction.findMany({ where: { importFileId: file.id } });
      assert.equal(saved.length, 1);
      assert.equal(saved[0].accountId, card.id);
      assert.equal(saved[0].type, 'expense'); assert.equal(saved[0].currency, 'PHP'); assert.equal(String(saved[0].amount), '145');
      assert.deepEqual(await db.account.findMany({ where: { workspace: { userId: user.id } }, orderBy: { id: 'asc' } }), accountsBefore, 'Explicit match preserves every account field, identity, currency, balance and timestamp');
      assert.deepEqual(await db.transaction.findUniqueOrThrow({ where: { id: prior.id } }), prior);
      const signals = await db.trainingSignal.findMany({ where: { importFileId: file.id } });
      assert.equal(signals.length, 1); assert.equal(signals[0].transactionId, saved[0].id); assert.equal(signals[0].type, 'expense');
      const jobs = await db.learningJob.findMany({ where: { workspaceId: workspace.id } });
      assert.equal(jobs.length, 2); assert(jobs.every(job => job.status === 'completed'), JSON.stringify(jobs.map(job => ({ source: job.source, status: job.status, code: job.errorCode, message: job.errorMessage, next: job.nextAttemptAt }))));
      assert.equal((await loadImportStatusSnapshot(file.id))?.settledImportComplete, true);
      const snapshot = async () => JSON.stringify(await Promise.all([
        db.account.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.transaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
        db.parsedTransaction.findMany({ where: { importFileId: file.id }, orderBy: { id: 'asc' } }), db.importFile.findUniqueOrThrow({ where: { id: file.id } }),
        db.learningJob.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.trainingSignal.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
        db.statementTemplate.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.accountStatementCheckpoint.findMany({ where: { importFileId: file.id } }),
      ]));
      const before = await snapshot(); await confirmImportFile(file.id, card.id); await settle(workspace.id);
      assert.equal(await snapshot(), before, 'Repeat confirmation preserves financial, source and learning rows including timestamps');
    }
  } finally { await drain(); await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
  assert.equal(network, 0);
  console.log('Grab payment reference: source-only review, explicit same-Profile/currency/suffix selection, no invented issuer/Cash, durable learning and complete confirmed-data preservation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
