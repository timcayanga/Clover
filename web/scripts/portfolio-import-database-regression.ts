import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { finalizePortfolioImport } from '../lib/portfolio-import';

const url = process.env.PORTFOLIO_QA_DATABASE_URL;
if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_qa')) throw new Error('Use an explicit isolated localhost *_qa database');
const db = new PrismaClient({adapter:new PrismaPg({connectionString:url})});
async function seed(label:string) {
 const user=await db.user.create({data:{clerkUserId:`portfolio-${label}-${Date.now()}`,email:`portfolio-${label}-${Date.now()}@example.invalid`,environment:'development'}});
 const ws=await db.workspace.create({data:{userId:user.id,name:'Portfolio fixture'}});
 const file=await db.importFile.create({data:{workspaceId:ws.id,fileName:'portfolio-fixture.jpeg',fileType:'image/jpeg',storageKey:'qa-only'}});
 const doc=await db.documentImport.create({data:{workspaceId:ws.id,importFileId:file.id,documentFamily:'portfolio',institution:'COL Financial',currency:'PHP'}});
 const snap=await db.investmentSnapshot.create({data:{workspaceId:ws.id,documentImportId:doc.id,currency:'PHP',rawPayload:{source:'fixture'}}});
 await db.investmentHolding.createMany({data:['FMETF','GTCAP','SM','URC'].map((name,i)=>({workspaceId:ws.id,documentImportId:doc.id,investmentSnapshotId:snap.id,assetName:name,assetSymbol:name,assetType:'stock',currency:'PHP',currentValue:1000+i,quantity:10,confidence:99,rawPayload:{currencyEvidence:'PHP',parserEvidence:{source_text:`${name} PHP ${1000+i}`}}}))});
 return {user,ws,file,doc,snap};
}
async function main(){
 const f=await seed('success');
 const existing=await db.account.create({data:{workspaceId:f.ws.id,type:'investment',name:'FMETF',institution:'COL Financial',currency:'PHP',balance:777,investmentQuantity:7,source:'manual'}});
 const before=JSON.stringify(existing);
 const params={importFileId:f.file.id,workspaceId:f.ws.id,accountLimit:10};
 const outcomes=await Promise.all([db.$transaction(tx=>finalizePortfolioImport(tx,params)),db.$transaction(tx=>finalizePortfolioImport(tx,params))]);
 assert.ok(outcomes.every(r=>r?.holdings===4));
 assert.equal(await db.account.count({where:{workspaceId:f.ws.id}}),4);
 assert.equal(await db.transaction.count({where:{workspaceId:f.ws.id}}),0);
 assert.equal(await db.investmentSnapshot.count({where:{workspaceId:f.ws.id}}),5,'Original source plus four derived snapshots');
 assert.equal(JSON.stringify(await db.account.findUnique({where:{id:existing.id}})),before,'Existing account including updatedAt must remain identical');
 const holdings=await db.investmentHolding.findMany({where:{documentImportId:f.doc.id},include:{investmentSnapshot:true,account:true}});
 assert.ok(holdings.every(h=>h.status==='pending_review'&&h.account?.type==='investment'&&h.investmentSnapshot.accountId===h.accountId));
 assert.equal((await db.importFile.findUniqueOrThrow({where:{id:f.file.id}})).status,'done');
 assert.equal(await db.auditLog.count({where:{workspaceId:f.ws.id,action:'import.portfolio_materialized'}}),1,'Concurrent retry should emit one completion');
 const failed=await seed('rollback');
 await assert.rejects(db.$transaction(tx=>finalizePortfolioImport(tx,{importFileId:failed.file.id,workspaceId:failed.ws.id,accountLimit:2})),/allowance/);
 assert.equal(await db.account.count({where:{workspaceId:failed.ws.id}}),0);
 assert.equal(await db.investmentSnapshot.count({where:{workspaceId:failed.ws.id}}),1);
 assert.equal(await db.investmentHolding.count({where:{documentImportId:failed.doc.id,accountId:null}}),4);
 assert.equal((await db.importFile.findUniqueOrThrow({where:{id:failed.file.id}})).status,'processing');
 const worker=await seed('worker');
 await db.accountStatementCheckpoint.create({data:{workspaceId:worker.ws.id,importFileId:worker.file.id,sourceMetadata:{importMode:'portfolio'}}});
 process.env.DATABASE_URL=url; process.env.DIRECT_URL=url;
 const { confirmImportFile } = await import('../workers/import-processor');
 const completed=await confirmImportFile(worker.file.id);
 assert.equal(completed.status,'done'); assert.equal(completed.confirmedTransactionsCount,0);
 assert.equal(await db.account.count({where:{workspaceId:worker.ws.id}}),4);
 const replay=await confirmImportFile(worker.file.id);assert.equal(replay.status,'done');
 const { loadImportStatusSnapshot } = await import('../lib/import-status-snapshot');
 const status=await loadImportStatusSnapshot(worker.file.id);
 assert.equal(status?.visibleImportComplete,true,'Holdings-only import must finish the UI waiting state');
 assert.equal(status?.settledImportComplete,true);
 assert.equal(status?.accountSummaries.length,4);
 const { prisma } = await import('../lib/prisma');await prisma.$disconnect();
 await db.user.deleteMany({where:{id:{in:[f.user.id,failed.user.id,worker.user.id]}}});
 console.log('Local PostgreSQL portfolio import passed: real account/snapshot joins, concurrent retries, zero ledger rows, protected existing values, audit and quota rollback.');
}
main().finally(()=>db.$disconnect());
