import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

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
globalThis.fetch = async () => { network++; throw new Error('Dormant SeaBank QA forbids provider calls'); };

async function main() {
  const text=readFileSync('scripts/fixtures/reviewed-parser-corpus/seabank-id-dormant-opening.txt','utf8');
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const { processLearningJob, retryLearningJob } = await import('../lib/learning-jobs');
  const { loadImportStatusSnapshot } = await import('../lib/import-status-snapshot');
  const { AI_CONSENT_VERSION } = await import('../../shared/ai-consent');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID() + '@example.invalid', environment: 'staging', planTier: 'pro', planTierLocked: true,
    appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  const settle = async (workspaceId: string) => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId, status: 'queued' } })) { if (await db.importFile.count({ where: { workspaceId, status: 'done' } })) await retryLearningJob(job.id, workspaceId); await processLearningJob(job.id); } };
  try {
    for (const balance of ['765.43','0',null]) {
      const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Dormant opening ' + String(balance) } });
      const card = await db.account.create({ data: { workspaceId: workspace.id, name: 'Confirmed historical account', nameCustomized:true, institution:'SeaBank', institutionCustomized:true, accountNumber:'901000000654', importIdentityAccountNumber:'901000000654', importIdentityInstitution:'SeaBank', type:'bank', currency:'IDR', source:'manual', balance } });
      const prior = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: card.id, date: new Date('2026-01-01T12:00:00Z'), amount: '97.25', currency: 'IDR', type: 'expense', merchantRaw: 'Manual evidence', merchantClean: 'Confirmed correction', reviewStatus: 'edited', rawPayload: { source: 'manual' } } });
      const accountsBefore = await db.account.findMany({ where: {workspaceId:workspace.id}, orderBy:{id:'asc'} });
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'invented-dormant-opening.pdf', fileType: 'application/pdf', storageKey: 'qa/' + randomUUID() } });
      await processImportFileText(file.id, { text, importMode:'statement', actorUserId: user.clerkUserId });
      await settle(workspace.id);
      const saved = await db.transaction.findMany({ where: { importFileId: file.id } });
      assert.equal(saved.length,3); assert(saved.every(row=>row.accountId===card.id && row.currency==='IDR' && row.type==='income'));
      assert.equal(saved.filter(row=>String(row.amount)==='500').length,2,'Legitimate repeated credits stay distinct');
      assert.equal(saved.filter(row=>String(row.amount)==='1').length,1);
      for(const row of saved){const raw=row.rawPayload as Record<string,unknown>;assert.equal((raw.dormantOpeningProof as Record<string,unknown>).serialPeriodConflict,true);assert.equal((raw.dormantOpeningProof as Record<string,unknown>).sourceMetadataNeedsReview,true);assert.notEqual(row.reviewStatus,'confirmed','Source metadata review is not silently user-confirmed');}

      assert.deepEqual(await db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}), accountsBefore, 'Dormant legacy source preserves confirmed zero, unknown or current IDR balances, identity and all timestamps');
      assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:prior.id}}), prior);
      assert.equal(await db.parsedTransaction.count({where:{importFileId:file.id}}),3);
      const signals = await db.trainingSignal.findMany({where:{importFileId:file.id}});
      assert.equal(signals.length,3); assert(signals.every(signal=>signal.type==='income'&&saved.some(row=>row.id===signal.transactionId))); 
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
  console.log('Dormant SeaBank: repeated IDR credits and dated interest, retained serial review, completed durable learning, repeat no-op and immutable historical account/edited transaction evidence including zero and unknown balances passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
