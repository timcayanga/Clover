import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildPosbPdfRows, parsePosbStatement } from '../lib/posb-statement';
import { parseGcashBillsReceipt, gcashBillsReceiptTextLayerIsComplete } from '../lib/gcash-bills-receipt';
import { parseImportText, detectStatementMetadata } from '../lib/import-parser';

const url=new URL(process.env.DATABASE_URL??'http://invalid');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55441');assert.equal(url.pathname,'/clover_migration_qa');assert(process.argv.includes('--execute'));
const require=createRequire(import.meta.url);
require('next/cache').revalidateTag=()=>{};
const tasks:Array<()=>Promise<void>>=[];require('next/server').after=(task:()=>Promise<void>)=>tasks.push(task);
const drain=async()=>{while(tasks.length) await Promise.all(tasks.splice(0).map(t=>t()));};
let network=0;globalThis.fetch=async()=>{network++;throw new Error('Scribd pilot regression prohibits providers');};
const source=(name:string)=>readFileSync(new URL(`./fixtures/reviewed-parser-corpus/${name}.txt`,import.meta.url),'utf8');

async function main(){
  const posb=source('posb-column-ledger'),gcash=source('gcash-bill-fee-email');
  assert.equal(gcashBillsReceiptTextLayerIsComplete(gcash),true);
  assert.equal(gcashBillsReceiptTextLayerIsComplete(gcash.replace('Amount Paid PHP 120.00\n','')),false,'An image-only net bill cannot be inferred from a partial native receipt');
  assert.equal(gcashBillsReceiptTextLayerIsComplete('Airline e-ticket native receipt text'),true,'Unrelated text-native receipts retain their established fast path');
  const nativeBody=gcash.replace('Subject: GCash Bills Pay Receipt\n','').replace('Date: Feb 1, 2025 at 6:09:25 PM\n','').replace('INC (SAMPLE)\nBiller Name','Biller Name\nINC (SAMPLE)');
  assert.equal(gcashBillsReceiptTextLayerIsComplete(nativeBody),true,'Receipt fields identify the payment even when the email header is image-only');
  assert.equal(parseGcashBillsReceipt(nativeBody)?.rows[0].merchantRaw,'INVENTED ELECTRIC COOPERATIVE, INC (SAMPLE)');
  const exportCsv='date,amount,currency,type,merchant,account,notes\n2025-06-03,4.50,USD,expense,Invented shop,Export account,"'+gcash.replaceAll('"','""')+'"\n';
  const exportRows=parseImportText(exportCsv,'export.csv','text/csv');
  assert.equal(exportRows.length,1,'A receipt inside an export memo cannot replace the export ledger');
  assert.equal(exportRows[0].date,'2025-06-03');assert.equal(exportRows[0].amount,'4.50');assert.equal(exportRows[0].currency,'USD');
  assert.equal(detectStatementMetadata(exportCsv,'export.csv')?.currency,'USD');
  assert.throws(()=>parsePosbStatement(posb.replace('80.22','80.23')),/balance does not reconcile/);
  assert.throws(()=>parsePosbStatement(posb.replace('Page 1 of 1','Page 1 of 2')),/pages are missing/);
  assert.throws(()=>parsePosbStatement(posb.replace('As at 31 Dec 2025','As at 31 Dec')),/year is missing/);
  assert.throws(()=>parseGcashBillsReceipt(gcash.replaceAll('123.25','123.26')),/do not reconcile/);
  assert.throws(()=>parseGcashBillsReceipt(gcash+'\nTotal Amount PHP 900.00'),/conflicting totals/);
  const item=(str:string,x:number,y:number,width=20)=>({str,transform:[1,0,0,1,x,y],width});
  const points=[item('Details of Your POSB Payroll Account',50,600),item('WITHDRAWAL($)',300,550,60),item('DEPOSIT($)',400,550,40),item('BALANCE($)',480,550,40),item('09 Dec',30,500),item('FAST Payment / Receipt',95,500),item('Wise:INVENTED',95,485),item('10.00',340,500),item('90.00',500,500),item('27 Dec',30,450),item('Salary',95,450),item('5.20',420,450),item('95.20',500,450),item('Balance Carried Forward',95,420)];
  assert.deepEqual(buildPosbPdfRows(points),['POSB_TXN | 09 Dec | outgoing | 10.00 | 90.00 | FAST Payment / Receipt Wise:INVENTED','POSB_TXN | 27 Dec | incoming | 5.20 | 95.20 | Salary']);
  assert(buildPosbPdfRows([...points,item('2.00',420,500)]).includes('POSB_INVALID_COLUMN_EVIDENCE'));
  assert.deepEqual(buildPosbPdfRows(points.filter(p=>p.str!=='Details of Your POSB Payroll Account')),[]);
  const {prisma:db}=await import('../lib/prisma');
  const {processImportFileText,confirmImportFile}=await import('../workers/import-processor');
  const {processLearningJob}=await import('../lib/learning-jobs');
  const {loadImportStatusSnapshot}=await import('../lib/import-status-snapshot');
  const {AI_CONSENT_VERSION}=await import('../../shared/ai-consent');
  const {resolveImportFileExtractionCacheVersion}=await import('../lib/data-engine');
  assert.equal(resolveImportFileExtractionCacheVersion('GCash-Bills-Pay-Receipt.pdf'),'v40-gcash-bills-receipt');
  assert.equal(resolveImportFileExtractionCacheVersion('ordinary-airline-receipt.pdf'),'v39');
  const user=await db.user.create({data:{clerkUserId:randomUUID(),email:`${randomUUID()}@example.invalid`,environment:'staging',planTier:'pro',planTierLocked:true,appPreferences:{aiConsent:{version:AI_CONSENT_VERSION,grantedAt:new Date().toISOString(),withdrawnAt:null}}}});
  try{
    const workspace=await db.workspace.create({data:{userId:user.id,name:'Reviewed Scribd source families'}});
    const fingerprint=createHash('sha256').update(gcash).digest('hex');
    const oldCache=await db.importFileExtractionCache.create({data:{workspaceId:workspace.id,fileFingerprint:fingerprint,fileType:'application/pdf',importMode:'statement',cacheVersion:'v39',extractedText:gcash.replace('Amount Paid PHP 120.00\n','')}});
    await db.importFileExtractionCache.create({data:{workspaceId:workspace.id,fileFingerprint:fingerprint,fileType:'application/pdf',importMode:'statement',cacheVersion:'v40-gcash-bills-receipt',extractedText:gcash}});
    assert.deepEqual(await db.importFileExtractionCache.findUniqueOrThrow({where:{id:oldCache.id}}),oldCache,'The complete extraction is additive; legacy source evidence is not refreshed');
    const settle=async()=>{await drain();for(const j of await db.learningJob.findMany({where:{workspaceId:workspace.id,status:'queued'}}))await processLearningJob(j.id);};
    for(const [text,name,count,currency,balance] of [[posb,'posb-column-ledger',5,'SGD',80.22],[gcash,'gcash-bill-fee-email',2,'PHP',null]] as const){
      const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:name+'.pdf',fileType:'application/pdf',storageKey:`qa/${randomUUID()}`,sourceFingerprint:createHash('sha256').update(text).digest('hex')}});
      await processImportFileText(file.id,{text,importMode:'statement',actorUserId:user.id});await settle();
      const rows=await db.transaction.findMany({where:{importFileId:file.id},include:{account:true,category:true},orderBy:{id:'asc'}});
      const originalRows=rows.filter(r=>(r.rawPayload as any).source!=='derived_atm_cash_transfer');
      if(balance!==null)assert.equal((await db.accountStatementCheckpoint.findUniqueOrThrow({where:{importFileId:file.id}})).status,'reconciled');
      if(balance!==null){const parsed=await db.parsedTransaction.findMany({where:{importFileId:file.id}});assert(originalRows.filter(r=>r.merchantRaw?.includes('FAST Payment')).every(r=>r.category?.name==='Transfers'&&r.type==='expense'),`POSB external transfers require source direction: ${JSON.stringify({transactions:originalRows.map(r=>({type:r.type,category:r.category?.name,sourceCategory:(r.rawPayload as any).sourceCategoryName})),parsed:parsed.map(r=>({category:r.categoryName,merchant:r.merchantRaw,source:(r.rawPayload as any).source,classification:(r.rawPayload as any).classification}))})}`);}
      assert.equal(originalRows.length,count);assert(rows.every(r=>r.currency===currency&&r.account?.currency===currency));
      if(balance!==null){assert.equal(rows.length,6);assert.equal(Number(originalRows[0].account!.balance),balance);assert.equal(originalRows[0].account!.accountNumber,'000-00123-4');assert.equal(originalRows.filter(r=>Number(r.amount)===10).length,2);assert(rows.every(r=>r.date.getUTCFullYear()===2025));const mirror=rows.find(r=>(r.rawPayload as any).source==='derived_atm_cash_transfer')!;assert.equal(Number(mirror.amount),5);assert(originalRows.some(r=>r.id===(mirror.rawPayload as any).atmCashTransfer.sourceTransactionId));}
      else {assert(rows.every(r=>r.account!.accountNumber===null));assert.deepEqual(rows.map(r=>Number(r.amount)).sort((a,b)=>a-b),[3.25,120]);assert(rows.every(r=>r.date.toISOString()==='2025-02-01T10:09:19.000Z'));}
      if(balance===null){
        const published=await db.accountStatementCheckpoint.findUniqueOrThrow({where:{importFileId:file.id}});
        const first=await loadImportStatusSnapshot(file.id);assert(first?.settledImportComplete);
        assert.deepEqual(await db.accountStatementCheckpoint.findUniqueOrThrow({where:{importFileId:file.id}}),published,'The first settled receipt read leaves the published checkpoint untouched');
        assert.equal(String((first!.statementCheckpoint!.sourceMetadata as any).publishedAccountSummaries[0].balance),String(rows[0].account!.balance));
        const checkpoint=await db.accountStatementCheckpoint.findUniqueOrThrow({where:{importFileId:file.id}});
        await loadImportStatusSnapshot(file.id);
        assert.deepEqual(await db.accountStatementCheckpoint.findUniqueOrThrow({where:{importFileId:file.id}}),checkpoint,'Settled receipt reads do not repair the balance projection or timestamp');
      }
      const knowledge=async()=>JSON.stringify({rows:await db.transaction.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),signals:await db.trainingSignal.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),rules:await db.merchantRule.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}}),accounts:await db.account.findMany({where:{workspaceId:workspace.id},orderBy:{id:'asc'}})});
      const before=await knowledge();await confirmImportFile(file.id);await settle();
      const after=await knowledge();
      if(after!==before){const a=JSON.parse(after),b=JSON.parse(before);const changed=Object.keys(a).flatMap(table=>a[table].flatMap((r:any,i:number)=>Object.keys(r).filter(k=>JSON.stringify(r[k])!==JSON.stringify(b[table][i]?.[k])).map(field=>`${table}.${i}.${field}`)));assert.fail(`Repeat confirmation changed protected fields: ${changed.join(', ')}`);}
    }
    const jobs=await db.learningJob.findMany({where:{workspaceId:workspace.id}});assert(jobs.length>=4&&jobs.every(j=>j.status==='completed'));
    assert.equal(network,0);console.log('Scribd pilot: column evidence, missing pages, source year, bill/fee identity, real worker, repeated rows and durable learning passed.');
  }finally{await drain();await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
