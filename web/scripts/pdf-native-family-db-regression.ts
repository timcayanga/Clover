/** Synthetic byte-backed worker checks; retained labels are independent inputs.
 * This is not a public extraction-accuracy or device-latency measurement. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { syntheticPdfFixtureBytes } from './fixtures/synthetic-source-pdf';
import { SOURCE_REVIEW_PHASE, isSourceReviewRequiredError } from '../lib/import-source-review';
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/clover_migration_qa'); assert(process.argv.includes('--execute'));
const require = createRequire(import.meta.url);
const tasks: Array<()=>Promise<void>>=[];
require('next/cache').revalidateTag=()=>{};
require('next/server').after=(task:()=>Promise<void>)=>tasks.push(task);
let network=0;globalThis.fetch=async()=>{network++;throw new Error('Native PDF QA prohibits providers');};
const root='scripts/fixtures/reviewed-parser-corpus/';
const source=(id:string)=>readFileSync(root+id+'.txt','utf8');
async function main(){
 const {prisma:db}=await import('../lib/prisma');
 const {processImportFileText,confirmImportFile}=await import('../workers/import-processor');
 const {verifyPdfStatementPageCoverage,readPdfStatementEvidencePages}=await import('../lib/import-file-text.server');
 const {processLearningJob}=await import('../lib/learning-jobs');
 const {AI_CONSENT_VERSION}=await import('../../shared/ai-consent');
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+'@example.invalid',environment:'staging',planTier:'pro',planTierLocked:true,
  appPreferences:{aiConsent:{version:AI_CONSENT_VERSION,grantedAt:new Date().toISOString(),withdrawnAt:null}}}});
 const drain=async()=>{while(tasks.length)await Promise.all(tasks.splice(0).map(task=>task()));};
 const settle=async(workspaceId:string)=>{await drain();for(const job of await db.learningJob.findMany({where:{workspaceId,status:'queued'}}))await processLearningJob(job.id);};
 const manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
 try{
  for(const id of ['posb-column-ledger','gcash-bill-fee-email','cimb-consolidated-zero-account','grab-food-gcash-clock']){
   const workspace=await db.workspace.create({data:{userId:user.id,name:'Byte-backed '+id}});
   const bytes=syntheticPdfFixtureBytes(source(id));
   await verifyPdfStatementPageCoverage(bytes,'');
   const text=readPdfStatementEvidencePages(bytes,'').nativeStructuredText;
   assert(text,'The native transcript must be read from these exact bytes');
   const fingerprint=createHash('sha256').update(bytes).digest('hex');
   const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:id+'.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID(),sourceFingerprint:fingerprint}});
   await processImportFileText(file.id,{text,sourceBytes:bytes,importMode:'statement',actorUserId:user.clerkUserId});await settle(workspace.id);
   const all=await db.transaction.findMany({where:{importFileId:file.id},include:{account:true}});
   const rows=all.filter(row=>(row.rawPayload as {source?:string})?.source!=='derived_atm_cash_transfer');
   const expected=manifest.cases.find((entry:{id:string})=>entry.id===id).expected.filter((row:{rawPayload?:{kind?:string}})=>row.rawPayload?.kind!=='account_snapshot_marker');
   const ledger=(row:{date:Date|string;amount:unknown;currency:string;type:string;accountNumber?:string|null;account?:{accountNumber:string|null}|null})=>[
    (row.date instanceof Date?row.date.toISOString():row.date).slice(0,10),Number(row.amount).toFixed(2),row.currency,row.type,row.account?.accountNumber??row.accountNumber??null].join('|');
   // The confirmed ATM movement is a transfer to the derived Cash counterpart.
   const normalizedExpected=expected.map((row:Record<string,unknown>)=>id==='posb-column-ledger' && Number(row.amount)===5 && row.type==='expense' ? {...row,type:'transfer'} : row);
   assert.deepEqual(rows.map(ledger).sort(),normalizedExpected.map(ledger).sort(),id+' exact labeled core fields and occurrences');
   assert.equal(all.length,expected.length+(id==='posb-column-ledger'?1:0));
   assert.equal((await db.importFile.findUniqueOrThrow({where:{id:file.id}})).sourceFingerprint,fingerprint);
   const snapshot=async()=>JSON.stringify(await Promise.all([
    db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),
    db.importFile.findUnique({where:{id:file.id}}),db.parsedTransaction.findMany({where:{importFileId:file.id},orderBy:{id:'asc'}})]));
   const before=await snapshot();await confirmImportFile(file.id);await settle(workspace.id);assert.equal(await snapshot(),before,'Byte-backed retry preserves source, finance and timestamps');
  }
  {
   const workspace=await db.workspace.create({data:{userId:user.id,name:'Conflicting supplied clock'}});
   const bytes=syntheticPdfFixtureBytes(source('gcash-bill-fee-email'));
   await verifyPdfStatementPageCoverage(bytes,'');
   const native=readPdfStatementEvidencePages(bytes,'').nativeStructuredText!;
   const supplied=native.replace('6:09:19 PM','6:09:18 PM');assert.notEqual(supplied,native);
   const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:'gcash-bill-fee-email.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID(),sourceFingerprint:createHash('sha256').update(bytes).digest('hex')}});
   await assert.rejects(()=>processImportFileText(file.id,{text:supplied,sourceBytes:bytes,importMode:'statement',actorUserId:user.clerkUserId}),/verify every transaction/);
   assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),0);
   assert.equal(await db.learningJob.count({where:{workspaceId:workspace.id}}),0);
   assert.equal((await db.importFile.findUniqueOrThrow({where:{id:file.id}})).processingPhase,SOURCE_REVIEW_PHASE);
  }
  {
   const workspace=await db.workspace.create({data:{userId:user.id,name:'Incomplete native BCA proof'}});
   const bytes=syntheticPdfFixtureBytes(source('bca-transfer-components').replace('BCA_NATIVE_PAGES 1','BCA_NATIVE_PAGES 2'));
   await verifyPdfStatementPageCoverage(bytes,'');
   const text=readPdfStatementEvidencePages(bytes,'').nativeStructuredText!;
   const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:'partial-bca.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID(),sourceFingerprint:createHash('sha256').update(bytes).digest('hex')}});
   await assert.rejects(()=>processImportFileText(file.id,{text,sourceBytes:bytes,importMode:'statement',actorUserId:user.clerkUserId}),isSourceReviewRequiredError);
   assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),0);
   assert.equal(await db.learningJob.count({where:{workspaceId:workspace.id}}),0);
   assert.equal((await db.importFile.findUniqueOrThrow({where:{id:file.id}})).processingPhase,SOURCE_REVIEW_PHASE);
  }
  for(const id of ['gcash-multiple-native-receipts','grab-cash-date-only']){
   const workspace=await db.workspace.create({data:{userId:user.id,name:'Duplicate physical pages '+id}});
   const bytes=syntheticPdfFixtureBytes(source(id));await verifyPdfStatementPageCoverage(bytes,'');
   const text=readPdfStatementEvidencePages(bytes,'').nativeStructuredText!;
   const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:id+'.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID(),sourceFingerprint:createHash('sha256').update(bytes).digest('hex')}});
   await assert.rejects(()=>processImportFileText(file.id,{text,sourceBytes:bytes,importMode:'statement',actorUserId:user.clerkUserId}),/repeated copy on page/);
   assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),0);assert.equal(await db.learningJob.count({where:{workspaceId:workspace.id}}),0);
   assert.equal((await db.importFile.findUniqueOrThrow({where:{id:file.id}})).processingPhase,SOURCE_REVIEW_PHASE);
  }
  assert.equal(network,0);
  console.log('PASS byte-backed native PDF families: labeled fields/occurrences, exact source hashes, immutable replay and duplicate-page refusal before finance or learning.');
 }finally{await drain();await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
