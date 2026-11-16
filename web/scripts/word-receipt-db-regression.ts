import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { parseGrabEmailReceipt,hasVerifiedGrabReceiptRows } from '../lib/grab-email-receipt';

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
globalThis.fetch = async () => { network++; throw new Error('Native Word QA forbids provider calls'); };

async function main() {
  const { readUploadedFileText,readImportedFileTextWithCacheInfo } = await import('../lib/import-file-text.server');
  const bytes = readFileSync('scripts/fixtures/reviewed-parser-corpus/grab-native-word.docx');
  const text = await readUploadedFileText({name:'invented-word.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
  const { prisma: db } = await import('../lib/prisma');
  const { processImportFileText, confirmImportFile } = await import('../workers/import-processor');
  const { processLearningJob, retryLearningJob,enqueueLearningJob } = await import('../lib/learning-jobs');
  const {upsertImportFileExtractionCache,loadImportFileExtractionCache,resolveImportFileExtractionCacheVersion} = await import('../lib/data-engine');
  const { loadImportStatusSnapshot } = await import('../lib/import-status-snapshot');
  const { AI_CONSENT_VERSION } = await import('../../shared/ai-consent');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID() + '@example.invalid', environment: 'staging', planTier: 'pro', planTierLocked: true,
    appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  const settle = async (workspaceId: string) => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId, status: 'queued' } })) { if (await db.importFile.count({ where: { workspaceId, status: 'done' } })) await retryLearningJob(job.id, workspaceId); await processLearningJob(job.id); } };
  try {
    for (const {importMode,existingCash} of [{importMode:'statement' as const,existingCash:true},{importMode:'receipt' as const,existingCash:true},{importMode:'statement' as const,existingCash:false}]) {
      const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Reviewed payment reference ' + importMode } });
      const card = await db.account.create({ data: { workspaceId: workspace.id, name: existingCash?'Cash':'Preserved bank', type: existingCash?'cash':'bank', currency: 'PHP', source: 'manual', balance: '765.43' } });
      const prior = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: card.id, date: new Date('2026-01-01T12:00:00Z'), amount: '97.25', currency: 'PHP', type: 'expense', merchantRaw: 'Manual evidence', merchantClean: 'Confirmed correction', reviewStatus: 'edited', rawPayload: { source: 'manual' } } });
      const accountsBefore = await db.account.findMany({ where: {workspaceId:workspace.id}, orderBy:{id:'asc'} });
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: 'invented-native-word.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', storageKey: 'qa/' + randomUUID(),sourceFingerprint:createHash('sha256').update(bytes).digest('hex') } });
      const native=parseGrabEmailReceipt(text)!;
      const cacheParams={workspaceId:workspace.id,fileFingerprint:file.sourceFingerprint!,fileType:file.fileType,importMode,cacheVersion:resolveImportFileExtractionCacheVersion(file.fileName)};
      const stored=await readImportedFileTextWithCacheInfo({...cacheParams,storageKey:file.storageKey!,fileName:file.fileName,sourceBytes:bytes});assert.equal(stored.text,text);
      await upsertImportFileExtractionCache({...cacheParams,extractedText:text,statementFingerprint:'qa-word-cache-'+file.id,metadata:JSON.parse(JSON.stringify(native.metadata)),parsedRows:JSON.parse(JSON.stringify(native.rows)),confidence:95});
      const cached=await loadImportFileExtractionCache(cacheParams);assert(cached);
      assert.equal(hasVerifiedGrabReceiptRows(text,cached.parsedRows as unknown as typeof native.rows),true,'Proof remains verified after real JSONB extraction-cache storage');
      let obsoleteId:string|null=null;let obsoletePayload:unknown;
      if(!existingCash){const old=await enqueueLearningJob({workspaceId:workspace.id,source:'import_template',sourceId:file.id,actions:[{kind:'template',sourceImportFileId:file.id,requireCompletedSource:true,input:{workspaceId:workspace.id,fingerprint:'obsolete-empty-'+file.id,fileType:file.fileType,metadata:native.metadata,parserConfig:{rowCount:0}}}]});assert(old);obsoleteId=old.id;obsoletePayload=(await db.learningJob.findUniqueOrThrow({where:{id:old.id}})).payload;await processLearningJob(old.id);assert.equal((await db.learningJob.findUniqueOrThrow({where:{id:old.id}})).errorCode,'SOURCE_NOT_READY');}
      await processImportFileText(file.id, { text, textCacheInfo:{fileFingerprint:file.sourceFingerprint!,text,cacheHit:true,cacheRecord:cached},sourceBytes:bytes,importMode, actorUserId: user.clerkUserId });
      await settle(workspace.id);
      const saved = await db.transaction.findMany({ where: { importFileId: file.id } });
      assert.equal(saved.length, 1); if(existingCash)assert.equal(saved[0].accountId,card.id);else{assert.notEqual(saved[0].accountId,card.id);const cash=await db.account.findUniqueOrThrow({where:{id:saved[0].accountId!}});assert.equal(cash.type,'cash');assert.equal(cash.currency,'PHP');}
      assert.equal(saved[0].type, 'expense'); assert.equal(saved[0].currency, 'PHP'); assert.equal(String(saved[0].amount), '250');
      assert.equal((saved[0].rawPayload as Record<string,unknown>).sourceContainer, 'docx');
      assert.deepEqual(await db.account.findMany({where:{workspaceId:workspace.id,id:{in:accountsBefore.map(account=>account.id)}},orderBy:{id:'asc'}}), accountsBefore, 'Native Word receipt preserves existing cash balance, identity and all timestamps');
      assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:prior.id}}), prior);
      assert.equal(await db.parsedTransaction.count({where:{importFileId:file.id}}),1);
      const signals = await db.trainingSignal.findMany({where:{importFileId:file.id}});
      assert.equal(signals.length,1); assert.equal(signals[0].transactionId,saved[0].id);
      const jobs = await db.learningJob.findMany({where:{workspaceId:workspace.id}});
      assert.equal(jobs.length,obsoleteId?3:2);assert(jobs.filter(job=>job.id!==obsoleteId).every(job=>job.status==='completed'));
      if(obsoleteId){const old=await db.learningJob.findUniqueOrThrow({where:{id:obsoleteId}});assert.equal(old.status,'cancelled');assert.equal(old.errorCode,'SUPERSEDED_SOURCE');assert.equal(old.appliedItems,0);assert.equal(old.nextIndex,0);assert.deepEqual(old.payload,obsoletePayload);assert.equal(await db.statementTemplate.count({where:{workspaceId:workspace.id,fingerprint:'obsolete-empty-'+file.id}}),0);assert.equal((await db.learningJobAttempt.findFirstOrThrow({where:{jobId:old.id},orderBy:{attempt:'desc'}})).errorCode,'SUPERSEDED_SOURCE');await retryLearningJob(old.id,workspace.id);assert.deepEqual(await db.learningJob.findUniqueOrThrow({where:{id:old.id}}),old,'Cancelled snapshots cannot reset or reactivate on retry');}
      assert.equal((await loadImportStatusSnapshot(file.id))?.settledImportComplete,true);
      const snapshot = async () => JSON.stringify(await Promise.all([
        db.account.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.transaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
        db.parsedTransaction.findMany({ where: { importFileId: file.id }, orderBy: { id: 'asc' } }), db.importFile.findUniqueOrThrow({ where: { id: file.id } }),
        db.learningJob.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.trainingSignal.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }),
        db.statementTemplate.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: 'asc' } }), db.accountStatementCheckpoint.findMany({ where: { importFileId: file.id } }),
      ]));
      const before = await snapshot(); await confirmImportFile(file.id, saved[0].accountId); await settle(workspace.id);
      assert.equal(await snapshot(), before, 'Repeat confirmation preserves financial, source and learning rows including timestamps');
    }
  } finally { await drain(); await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
  assert.equal(network, 0);
  console.log('Native Word receipt: stored-file decoding, real JSONB cache/proof reuse, safe new Cash, superseded empty-job audit, both import modes, exact source expense, completed durable learning, repeat no-op, preserved confirmed cash balance, account identity and edited transactions passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
