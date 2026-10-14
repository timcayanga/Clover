import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parseMariBankNativeLedger} from '../lib/maribank-native-ledger';
import {parsePosbStatement} from '../lib/posb-statement';
import {shouldPersistPublishedAccountSummaries} from '../lib/import-checkpoint-publication';
const url=new URL(process.env.DATABASE_URL??'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??'55441');assert.equal(url.pathname,'/clover_migration_qa');assert(process.argv.includes('--execute'));
const require=createRequire(import.meta.url);require('next/cache').revalidateTag=()=>{};const tasks:Array<()=>Promise<void>>=[];require('next/server').after=(t:()=>Promise<void>)=>tasks.push(t);const drain=async()=>{while(tasks.length)await Promise.all(tasks.splice(0).map(t=>t()));};let network=0;globalThis.fetch=async()=>{network++;throw new Error('Sixth batch regression prohibits providers');};
const source=(id:string)=>readFileSync('scripts/fixtures/reviewed-parser-corpus/'+id+'.txt','utf8');
async function main(){
 const zero=source('maribank-empty-zero-snapshot');
 const {knownStatementNativeTextIsComplete}=await import('../lib/import-file-text.server');
 assert.equal(knownStatementNativeTextIsComplete(zero,'MariBank Statement.pdf'),true,'Authoritative empty native pages must not be replaced with OCR illustrations');
 assert.equal(parseMariBankNativeLedger(zero.replace('ACCOUNT: 00123456789','ACCOUNT: 00123456789Call (+632) 8424 8050'))?.metadata.accountNumber,'00123456789','Adjacent explicit contact label must not contaminate the full source bank identity');
 assert.throws(()=>parseMariBankNativeLedger(zero.replace('ACCOUNT: 00123456789','ACCOUNT: 001234567890Call (+632) 8424 8050')),/review/,'Longer identifiers cannot be truncated to eleven digits');
 for(const bad of [zero.replace('NO RECENT TRANSACTION\nSAVINGS','UNKNOWN\nSAVINGS'),zero.replace('MARIBANK_NATIVE_ROW_COUNT 0','MARIBANK_NATIVE_ROW_COUNT 1'),zero.replace('page 2 of 2','page 2 of 3'),zero.replace('31 JUL 2026','32 JUL 2026'),zero.replace('SAVINGS 0.00 0.00 0.00 0.00','SAVINGS 0.00 1.00 1.00 0.00'),zero.replace('NO RECENT TRANSACTION\nSAVINGS','NO RECENT TRANSACTION\n10 JUL Hidden transfer\nSAVINGS')])assert.throws(()=>parseMariBankNativeLedger(bad),/review/);
 const everyday=source('posb-native-everyday-alias');assert.equal(parsePosbStatement(everyday)?.rows.length,4);assert.equal(parsePosbStatement(everyday.replaceAll('eEveryday Savings','Fixed Deposit')),null,'Unreviewed products cannot borrow the savings proof');assert.throws(()=>parsePosbStatement(everyday.replace('Page 2 of 2','Page 2 of 3')),/page|review/i);
 const {prisma:db}=await import('../lib/prisma');const {processImportFileText,confirmImportFile}=await import('../workers/import-processor');const {loadImportStatusSnapshot}=await import('../lib/import-status-snapshot');const {processLearningJob}=await import('../lib/learning-jobs');const {AI_CONSENT_VERSION}=await import('../../shared/ai-consent');
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+'@example.invalid',environment:'staging',planTier:'pro',planTierLocked:true,appPreferences:{aiConsent:{version:AI_CONSENT_VERSION,grantedAt:new Date().toISOString(),withdrawnAt:null}}}});
 try{for(const id of ['maribank-empty-zero-snapshot','seabank-empty-retained-balance']){for(const existing of [false,true]){
 const workspace=await db.workspace.create({data:{userId:user.id,name:id+' '+existing}});
 const saved=existing?await db.account.create({data:{workspaceId:workspace.id,name:'Confirmed savings',nameCustomized:true,institution:'SeaBank',accountNumber:'00123456789',type:'bank',currency:'PHP',balance:'987.65',source:'manual'}}):null;
 const prior=saved?JSON.stringify(saved):null;
 const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:'MariBank Statement.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID()}});
 const settle=async()=>{await drain();for(const j of await db.learningJob.findMany({where:{workspaceId:workspace.id,status:'queued'}}))await processLearningJob(j.id);};
 await processImportFileText(file.id,{text:source(id),importMode:'statement',actorUserId:user.clerkUserId});await settle();
 assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),0,'Empty source must never create finance');
 const parsed=await db.parsedTransaction.findMany({where:{importFileId:file.id}});assert.equal(parsed.length,1);assert.equal((parsed[0].rawPayload as any).kind,'account_snapshot_marker');assert.equal((parsed[0].rawPayload as any).sourceDocumentText,source(id));
 const account=await db.account.findFirstOrThrow({where:{workspaceId:workspace.id}});assert.equal(account.accountNumber,'00123456789');assert.equal(account.currency,'PHP');assert.equal(Number(account.balance),existing?987.65:id.startsWith('seabank')?12.34:0);
 if(prior)assert.equal(JSON.stringify(await db.account.findUniqueOrThrow({where:{id:saved!.id}})),prior,'Historical snapshot leaves full existing account and timestamps unchanged');
 const snapshot=async()=>JSON.stringify(await Promise.all([db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.importFile.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.parsedTransaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.merchantRule.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.accountRule.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.trainingSignal.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.statementTemplate.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.learningJob.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.accountStatementCheckpoint.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}})]));
 const before=await snapshot();const status=await loadImportStatusSnapshot(file.id);assert(status?.settledImportComplete);assert.equal(shouldPersistPublishedAccountSummaries(status),false);assert.equal(await snapshot(),before);await confirmImportFile(file.id);await settle();assert.equal(await snapshot(),before,'Retry preserves zero finance, evidence, learning and timestamps');
 const jobs=await db.learningJob.findMany({where:{workspaceId:workspace.id}});assert.equal(jobs.length,2);assert(jobs.every(j=>j.status==='completed'));
 }}
 for(const existing of [false,true]){
 const workspace=await db.workspace.create({data:{userId:user.id,name:'Native ATM '+existing}});
 const priorBank=existing?await db.account.create({data:{workspaceId:workspace.id,name:'Confirmed bank',nameCustomized:true,institution:'SeaBank',accountNumber:'00123456789',type:'bank',currency:'PHP',balance:'987.65',source:'manual'}}):null;
 const priorCash=existing?await db.account.create({data:{workspaceId:workspace.id,name:'Confirmed cash',nameCustomized:true,type:'cash',currency:'PHP',balance:'4321.09',source:'manual'}}):null;
 const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:'MariBank Statement ATM.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID()}});
 const settle=async()=>{await drain();for(const j of await db.learningJob.findMany({where:{workspaceId:workspace.id,status:'queued'}}))await processLearningJob(j.id);};
 await processImportFileText(file.id,{text:source('maribank-native-atm-fees'),importMode:'statement',actorUserId:user.clerkUserId});await settle();
 const rows=await db.transaction.findMany({where:{importFileId:file.id},include:{account:true}});assert.equal(rows.length,7);assert.equal(rows.filter(r=>(r.rawPayload as any).source==='derived_atm_cash_transfer').length,2);assert(rows.filter(r=>(r.rawPayload as any).source==='derived_atm_cash_transfer').every(r=>Number(r.amount)===100&&r.account?.type==='cash'&&r.account.currency==='PHP'&&r.isTransfer));
 assert.equal(rows.filter(r=>Number(r.amount)===15&&r.account?.type==='bank'&&!r.isTransfer).length,2,'Separate ATM fees must remain expense occurrences');
 if(priorBank)assert.deepEqual(await db.account.findUniqueOrThrow({where:{id:priorBank.id}}),priorBank);
 if(priorCash)assert.deepEqual(await db.account.findUniqueOrThrow({where:{id:priorCash.id}}),priorCash);
 const snapshot=async()=>JSON.stringify(await Promise.all([db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.importFile.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.parsedTransaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.learningJob.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.accountStatementCheckpoint.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}})]));
 const before=await snapshot();const status=await loadImportStatusSnapshot(file.id);assert(status?.settledImportComplete);assert.equal(status.confirmedTransactionsCount,7);assert.equal(shouldPersistPublishedAccountSummaries(status),false);assert.equal(await snapshot(),before);await confirmImportFile(file.id);await settle();assert.equal(await snapshot(),before,'ATM mirrors and source occurrences must not duplicate or refresh on retry');
 }
 {
 const workspace=await db.workspace.create({data:{userId:user.id,name:'POSB eEveryday native'}});const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:'POSB Statement.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID()}});
 const settle=async()=>{await drain();for(const j of await db.learningJob.findMany({where:{workspaceId:workspace.id,status:'queued'}}))await processLearningJob(j.id);};await processImportFileText(file.id,{text:everyday,importMode:'statement',actorUserId:user.clerkUserId});await settle();
 const rows=await db.transaction.findMany({where:{importFileId:file.id},include:{account:true}});assert.equal(rows.length,5);assert.equal(rows.filter(r=>(r.rawPayload as any).source==='derived_atm_cash_transfer').length,1);assert(rows.every(r=>r.currency==='SGD'&&r.account?.currency==='SGD'));assert.equal(rows.filter(r=>Number(r.amount)===2&&!r.isTransfer).length,1);
 const bank=await db.account.findFirstOrThrow({where:{workspaceId:workspace.id,type:'bank'}});assert.equal(bank.accountNumber,'001-23456-7');assert.equal(Number(bank.balance),298.01);
 const snapshot=async()=>JSON.stringify(await Promise.all([db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.importFile.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.parsedTransaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.learningJob.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.accountStatementCheckpoint.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}})]));const before=await snapshot();const status=await loadImportStatusSnapshot(file.id);assert(status?.settledImportComplete);assert.equal(shouldPersistPublishedAccountSummaries(status),false);assert.equal(await snapshot(),before);await confirmImportFile(file.id);await settle();assert.equal(await snapshot(),before);
 }
 }finally{await drain();await db.user.delete({where:{id:user.id}});await db.$disconnect();}
 assert.equal(network,0);console.log('Sixth batch: explicit empty ledgers retain snapshots without financial rows; existing identities, balances, evidence, learning and retry timestamps survive.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
