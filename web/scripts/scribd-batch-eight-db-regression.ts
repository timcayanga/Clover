import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'http://invalid');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??'55441');assert.equal(url.pathname,'/clover_migration_qa');assert(process.argv.includes('--execute'));
const require=createRequire(import.meta.url);require('next/cache').revalidateTag=()=>{};
const tasks:Array<()=>Promise<void>>=[];require('next/server').after=(task:()=>Promise<void>)=>tasks.push(task);
const drain=async()=>{while(tasks.length)await Promise.all(tasks.splice(0).map(task=>task()));};
let network=0;globalThis.fetch=async()=>{network++;throw new Error('Batch eight preservation forbids provider calls');};
async function main(){
 const {prisma:db}=await import('../lib/prisma');
 const {processImportFileText,confirmImportFile}=await import('../workers/import-processor');
 const {loadImportStatusSnapshot}=await import('../lib/import-status-snapshot');
 const {processLearningJob}=await import('../lib/learning-jobs');
 const {AI_CONSENT_VERSION}=await import('../../shared/ai-consent');
 const root='scripts/fixtures/reviewed-parser-corpus/';
 const manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+'@example.invalid',environment:'staging',planTier:'pro',planTierLocked:true,appPreferences:{aiConsent:{version:AI_CONSENT_VERSION,grantedAt:new Date().toISOString(),withdrawnAt:null}}}});
 try{
  for(const id of ['seabank-id-english-columns','seabank-id-spaced-identity']){
   const contract=manifest.cases.find((item:{id:string})=>item.id===id);
   const text=readFileSync(root+id+'.txt','utf8');
   const workspace=await db.workspace.create({data:{userId:user.id,name:id}});
   const account=await db.account.create({data:{workspaceId:workspace.id,name:'Confirmed current savings',nameCustomized:true,institution:'SeaBank',institutionCustomized:true,importIdentityInstitution:'SeaBank',accountNumber:'901000000456',type:'bank',currency:'IDR',balance:'765432.10'}});
   const confirmed=await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date('2026-04-22T12:00:00Z'),amount:'97.25',currency:'IDR',type:'expense',merchantRaw:'Confirmed original evidence',merchantClean:'Confirmed title',description:'Confirmed correction',reviewStatus:'edited',isExcluded:true,rawPayload:{source:'reviewed-existing-record',line:'Preserved source evidence'}}});
   const legacy=await db.importFileExtractionCache.create({data:{workspaceId:workspace.id,fileFingerprint:contract.sha256,fileType:'application/pdf',importMode:'statement',cacheVersion:'v46-held-native-sources',extractedText:'Retained earlier native extraction and labels'}});
   const settle=async()=>{await drain();for(const job of await db.learningJob.findMany({where:{workspaceId:workspace.id,status:'queued'}}))await processLearningJob(job.id);};
   for(const balance of ['765432.10','0',null]){
    if(balance!=='765432.10')await db.account.update({where:{id:account.id},data:{balance}});
    const savedAccount=await db.account.findUniqueOrThrow({where:{id:account.id}});
    const previousTransactions=await db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}});
    const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:id+'.pdf',fileType:'application/pdf',storageKey:'qa/'+randomUUID()}});
    await processImportFileText(file.id,{text,importMode:'statement',actorUserId:user.clerkUserId,allowDuplicateStatement:true});await settle();
    assert.deepEqual(await db.account.findUniqueOrThrow({where:{id:account.id}}),savedAccount,'Every confirmed identity, balance and timestamp survives historical English/IDR imports');
    for(const previous of previousTransactions)assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:previous.id}}),previous,'Existing confirmed/edited financial and raw values survive');
    assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:confirmed.id}}),confirmed);
    assert.deepEqual(await db.importFileExtractionCache.findUniqueOrThrow({where:{id:legacy.id}}),legacy,'Earlier extraction namespace and labels survive');
    const rows=await db.transaction.findMany({where:{importFileId:file.id},orderBy:{id:'asc'}});
    const parsed=await db.parsedTransaction.findMany({where:{importFileId:file.id},orderBy:{id:'asc'}});
    parsed.sort((a,b)=>Number((a.rawPayload as Record<string,unknown>)?.sourceRowIndex)-Number((b.rawPayload as Record<string,unknown>)?.sourceRowIndex));
    assert.equal(rows.length,balance==='765432.10'?5:0,'A reupload matches existing source movements without creating duplicates');assert.equal(parsed.length,5);
    const sourceTransactions=await db.transaction.findMany({where:{workspaceId:workspace.id,importFileId:{not:null}}});
    assert.equal(sourceTransactions.filter(row=>Number(row.amount)===40).length,2,'Identical same-day purchases remain separate across reuploads');
    const ledger=sourceTransactions.map(row=>[row.date.toISOString(),Number(row.amount).toFixed(2),row.currency,row.type,row.accountId].join('|')).sort();
    const expected=contract.expected.map((row:{date:string;amount:string;currency:string;type:string})=>[row.date+'T12:00:00.000Z',row.amount,row.currency,row.type,account.id].join('|')).sort();
    assert.deepEqual(ledger,expected);
    for(let index=0;index<parsed.length;index++){
     const raw=parsed[index].rawPayload as Record<string,unknown>;
     assert.equal(raw.source,'seabank_indonesia_native');assert.equal(raw.sourceRowIndex,index+1);
     assert.equal(raw.accountNumber,'901000000456');assert.equal(raw.balance,contract.expected[index].rawPayload.balance);
     assert.equal(raw.sourceDocumentText,text);assert.equal(raw.balanceReconciled,true);
     assert(sourceTransactions.some(row=>(row.rawPayload as Record<string,unknown>)?.line===raw.line),'Normalized evidence remains linked to its source row');
    }
    const snapshot=async()=>JSON.stringify(await Promise.all([
     db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),
     db.importFile.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.parsedTransaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),
     db.merchantRule.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.trainingSignal.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),
     db.accountRule.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.statementTemplate.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),
     db.learningJob.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),db.accountStatementCheckpoint.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),
     db.importFileExtractionCache.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}})
    ]));
    const jobs=await db.learningJob.findMany({where:{workspaceId:workspace.id,sourceId:file.id}});if(balance==='765432.10')assert.equal(jobs.length,2);assert(jobs.every(job=>job.status==='completed'));
    const before=await snapshot();const status=await loadImportStatusSnapshot(file.id);assert(status);
    if(balance==='765432.10')assert(status.settledImportComplete,'First complete source settles');
    else if(!status.settledImportComplete)assert(status.settlementIssues.length>0,'Historical overlap remains reviewable with an explicit reason');
    assert.equal(await snapshot(),before,'Status reads never repair confirmed financial values or source records');
    if(status.settledImportComplete){await confirmImportFile(file.id);await settle();assert.equal(await snapshot(),before,'Repeat settled confirmation preserves finance, learning, source records and all timestamps');}
   }
  }
 }finally{await drain();await db.user.delete({where:{id:user.id}});await db.$disconnect();}
 assert.equal(network,0);console.log('Batch eight: native English voucher ledger, split full identities, source occurrences, completed durable jobs, retained caches and confirmed financial/account preservation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
