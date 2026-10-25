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
  const { readUploadedFileText } = await import('../lib/import-file-text.server');
  const bytes = readFileSync('scripts/fixtures/reviewed-parser-corpus/grab-native-word.docx');
  const text = await readUploadedFileText({name:'invented-word.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
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
      const card = await db.account.create({ data: { workspaceId: workspace.id, name: 'Cash', type: 'cash', currency: 'PHP', source: 'manual', balance: '765.43' } });
      const prior = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: card.id, date: new Date('2026-01-01T12:00:00Z'), amount: '97.25', currency: 'PHP', type: 'expense', merchantRaw: 'Manual evidence', merchantClean: 'Confirmed correction', reviewStatus: 'edited', rawPayload: { source: 'manual' } } });
      const accountsBefore = await db.account.findMany({ where: {workspaceId:workspace.id}, orderBy:{id:'asc'} });
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'invented-native-word.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', storageKey: 'qa/' + randomUUID() } });
      await processImportFileText(file.id, { text, importMode, actorUserId: user.clerkUserId });
      await settle(workspace.id);
      const saved = await db.transaction.findMany({ where: { importFileId: file.id } });
      assert.equal(saved.length, 1); assert.equal(saved[0].accountId, card.id);
      assert.equal(saved[0].type, 'expense'); assert.equal(saved[0].currency, 'PHP'); assert.equal(String(saved[0].amount), '250');
      assert.equal((saved[0].rawPayload as Record<string,unknown>).sourceContainer, 'docx');
      assert.deepEqual(await db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}), accountsBefore, 'Native Word receipt preserves existing cash balance, identity and all timestamps');
      assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:prior.id}}), prior);
      assert.equal(await db.parsedTransaction.count({where:{importFileId:file.id}}),1);
      const signals = await db.trainingSignal.findMany({where:{importFileId:file.id}});
      assert.equal(signals.length,1); assert.equal(signals[0].transactionId,saved[0].id);
      const jobs = await db.learningJob.findMany({where:{workspaceId:workspace.id}});
      assert.equal(jobs.length,2); assert(jobs.every(job=>job.status==='completed'));
      assert.equal((await loadImportStatusSnapshot(file.id))?.settledImportComplete,true);
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
  console.log('Native Word receipt: both import modes, exact source expense, completed durable learning, repeat no-op, preserved confirmed cash balance, account identity and edited transactions passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
