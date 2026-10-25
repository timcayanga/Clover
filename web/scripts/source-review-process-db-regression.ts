import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { SourceReviewRequiredError, SOURCE_REVIEW_PHASE } from '../lib/import-source-review';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? '55441');
assert.equal(url.pathname, '/clover_migration_qa');
assert(process.argv.includes('--execute'));
const require = createRequire(import.meta.url);
require('next/server').after = () => {};
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('Process refusal regression prohibits providers'); };

async function main() {
  const { prisma: db } = await import('../lib/prisma');
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID()+'@example.invalid', environment: 'staging' } });
  const paths = ['../lib/auth', '../lib/workspace-access', '../lib/s3', '../workers/import-processor'].map(path => require.resolve(path));
  const prior = paths.map(path => require.cache[path]);
  let parserCalls = 0;
  const retained = new Map<string, Uint8Array>();
  const refusal = new SourceReviewRequiredError('Native source requires review: IDR summary columns');
  const exports = [
    { isLocalDevHost: async () => false, requireAuth: async () => ({ userId: user.clerkUserId }) },
    { assertWorkspaceAccess: async (_actor: string, id: string) => { assert(await db.workspace.findFirst({ where: { id, userId: user.id } })); } },
    { uploadObject: async (key: string, bytes: Uint8Array) => { retained.set(key, bytes.slice()); } },
    { processImportFileText: async (_id: string, options: {rawFileReady?: Promise<unknown>}) => {
      parserCalls++; await options.rawFileReady; await Promise.resolve(); throw refusal;
    } },
  ];
  paths.forEach((path, i) => { require.cache[path] = { id: path, filename: path, loaded: true, exports: exports[i] } as NodeModule; });
  try {
    const { POST } = await import('../app/api/imports/[importId]/process/route');
    const { POST: resume } = await import('../app/api/imports/[importId]/resume/route');
    const workspace = await db.workspace.create({ data: { userId: user.id, name: 'Async multipart source refusal' } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: 'Confirmed bank', type: 'bank', currency: 'PHP', balance: '123.45' } });
    const transaction = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, date: new Date('2026-10-20'), amount: '12.34', currency: 'PHP', type: 'expense', merchantRaw: 'Confirmed purchase', merchantClean: 'User edit', reviewStatus: 'edited' } });
    const protectedRows = async () => JSON.stringify([await db.account.findUniqueOrThrow({where:{id:account.id}}), await db.transaction.findUniqueOrThrow({where:{id:transaction.id}})]);
    const before = await protectedRows();
    for (const device of [false, true]) {
      const fileName = device ? 'capture.png' : 'unfamiliar.pdf';
      const fileType = device ? 'image/png' : 'application/pdf';
      const bytes = device ? Uint8Array.from([137,80,78,71,13,10,26,10]) : new TextEncoder().encode('%PDF-1.4\n% invented transport fixture\n%%EOF');
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName, fileType, storageKey: 'qa/'+randomUUID() } });
      const form = new FormData();
      form.set('file', new File([bytes],fileName,{type:fileType}));
      form.set('workspaceId',workspace.id); form.set('importMode','receipt'); form.set('forceInlineProcessing','true');
      if (device) form.set('deviceText',JSON.stringify({version:1,source:'apple_vision',text:'Invented contradictory bank evidence',pagesRead:1,totalPages:1,complete:true,durationMs:1}));
      const response = await POST(new Request('https://staging.clover.ph/api/imports/'+file.id+'/process',{method:'POST',headers:{Origin:'https://staging.clover.ph'},body:form}),{params:Promise.resolve({importId:file.id})});
      assert.equal(response.status,422,'An asynchronous parser refusal must return a structured source-review response');
      const payload = await response.json(); assert.equal(payload.code,'I-109'); assert.equal(payload.retryable,false); assert.equal(payload.requiresSourceReview,true); assert.equal(payload.diagnosticReason,refusal.message);
      const stored = await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      assert.equal(stored.status,'failed'); assert.equal(stored.processingPhase,SOURCE_REVIEW_PHASE);
      assert.deepEqual(retained.get(file.storageKey),bytes,'Original upload is retained before the refusal');
      assert.equal(stored.sourceFingerprint,createHash('sha256').update(bytes).digest('hex'));
      const calls = parserCalls;
      const repeated = await resume(new Request('https://staging.clover.ph/api/imports/'+file.id+'/resume',{method:'POST'}),{params:Promise.resolve({importId:file.id})});
      assert.equal(repeated.status,422); assert.equal(parserCalls,calls); assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),stored);
      for (const table of [db.parsedTransaction,db.learningJob,db.trainingSignal,db.statementTemplate]) assert.equal(await (table as typeof db.parsedTransaction).count({where:{workspaceId:workspace.id}}),0);
      assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),1); assert.equal(await db.account.count({where:{workspaceId:workspace.id}}),1); assert.equal(await protectedRows(),before);
    }
    assert.equal(parserCalls,2,'Receipt and device-text inline upload paths both reach the worker'); assert.equal(network,0);
    console.log('Process API: delayed receipt/device refusal returns I-109, retains source bytes, preserves confirmed finance and learning, and repeat resume is a no-op.');
  } finally {
    paths.forEach((path,i) => { if(prior[i]) require.cache[path]=prior[i]; else delete require.cache[path]; });
    await db.user.delete({where:{id:user.id}}); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
