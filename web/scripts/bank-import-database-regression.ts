import assert from 'node:assert/strict';
const url=process.env.BANK_IMPORT_QA_DATABASE_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('_qa'))throw Error('Explicit isolated localhost *_qa database required');
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
globalThis.fetch=(async()=>{throw Error('External network disabled for bank import QA');}) as typeof fetch;
async function main(){
 const {prisma:db}=await import('../lib/prisma');
 const {confirmImportFile}=await import('../workers/import-processor');
 const user=await db.user.create({data:{clerkUserId:`bank-qa-${Date.now()}`,email:`bank-${Date.now()}@example.invalid`,environment:'development',planTier:'pro'}});
 try {
 const ws=await db.workspace.create({data:{userId:user.id,name:'Synthetic bank import QA'}});
 const account=await db.account.create({data:{workspaceId:ws.id,name:'Metrobank Savings',institution:'Metrobank',accountNumber:'0012345678901',type:'bank',currency:'PHP',source:'manual',balance:1000}});
 const conn=await db.finverseConnection.create({data:{workspaceId:ws.id,userId:user.id,stateHash:`qa-${Date.now()}`,stateExpiresAt:new Date(),status:'ready'}});
 await db.finverseAccountLink.create({data:{connectionId:conn.id,workspaceId:ws.id,accountId:account.id,externalAccountId:'qa-bank',rawPayload:{},normalizedPayload:{balance:900}}});
 const transaction=await db.transaction.create({data:{workspaceId:ws.id,accountId:account.id,date:new Date('2026-09-20'),amount:100,currency:'PHP',type:'expense',merchantRaw:'Coffee Store',merchantClean:'My coffee',description:'Keep my note',reviewStatus:'confirmed'}});
 await db.finverseTransactionRecord.create({data:{connectionId:conn.id,externalTransactionId:'qa-payment',externalAccountId:'qa-bank',transactionId:transaction.id,rawPayload:{},normalizedPayload:{}}});
 const makeFile=async(name:string,merchant:string)=>{
 const file=await db.importFile.create({data:{workspaceId:ws.id,accountId:account.id,fileName:name,fileType:'text/csv',storageKey:'qa-local-only',status:'processing'}});
 await db.parsedTransaction.create({data:{workspaceId:ws.id,importFileId:file.id,institution:'Metrobank',accountName:account.name,accountNumber:account.accountNumber,date:new Date('2026-09-20'),amount:100,currency:'PHP',type:'expense',merchantRaw:merchant,merchantClean:merchant,categoryName:'Food & Dining',confidence:99,rawPayload:{source:'structured_transaction_csv',sourceRowIndex:1,accountType:'bank',parserConfidence:100}}});return file;
 };
 const before=JSON.stringify(transaction);
 const exact=await makeFile('exact.csv','Coffee Store');await confirmImportFile(exact.id,account.id);
 assert.equal(await db.transaction.count({where:{workspaceId:ws.id}}),1,'Statement after bank sync must not duplicate the payment');
 assert.equal(JSON.stringify(await db.transaction.findUnique({where:{id:transaction.id}})),before,'Bank row must be byte-for-byte unchanged');
 const uncertain=await makeFile('uncertain.csv','Unrecognized narration');await confirmImportFile(uncertain.id,account.id);
 const review=await db.transaction.findFirstOrThrow({where:{importFileId:uncertain.id}});
 assert.equal(review.isExcluded,true);assert.equal(review.reviewStatus,'pending_review');
 // Reprocess the same source with altered values after the user confirmed it.
 await db.transaction.update({where:{id:review.id},data:{reviewStatus:'confirmed',amount:135,date:new Date('2026-09-22'),merchantClean:'User corrected',description:'Confirmed note',isExcluded:false}});
 const protectedBefore=JSON.stringify(await db.transaction.findUnique({where:{id:review.id}}));
 await db.importFile.update({where:{id:uncertain.id},data:{status:'processing',confirmedTransactionsCount:0}});
 await confirmImportFile(uncertain.id,account.id);
 assert.equal(JSON.stringify(await db.transaction.findUnique({where:{id:review.id}})),protectedBefore,'Re-import must preserve all confirmed fields including amount/date/exclusion');
 assert.equal(await db.account.count({where:{workspaceId:ws.id,type:'bank'}}),1,'Upload reuses the existing synced account');
 // Exercise actual database serialization, rather than only a mocked queue.
 const {reserveBankRefresh}=await import('../lib/finverse-refresh-limit');
 const attempts=await Promise.allSettled(Array.from({length:8},()=>reserveBankRefresh(conn)));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,4);
 assert.equal(await db.auditLog.count({where:{entityId:conn.id,action:'bank.refresh_attempt'}}),4);
 console.log('PASS real PostgreSQL: bank-first upload dedupe, review exclusion, confirmed re-import preservation, account reuse and concurrent refresh reservations.');
 } finally { await db.user.delete({where:{id:user.id}});await db.$disconnect(); }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
