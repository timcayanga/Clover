import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'http://invalid');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??'55441');assert.equal(url.pathname,'/clover_migration_qa');assert(process.argv.includes('--execute'));
globalThis.fetch=async()=>{throw Error('External services disabled in line-item QA');};
const require=createRequire(import.meta.url);
async function main(){
 const {prisma:db}=await import('../lib/prisma');
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:`${randomUUID()}@example.invalid`,environment:'staging'}});
 const saved=new Map<string,NodeModule|undefined>();
 const stub=(id:string,exports:unknown)=>{const path=require.resolve(id);saved.set(path,require.cache[path]);require.cache[path]={id:path,filename:path,loaded:true,exports} as NodeModule;};
 stub('../lib/auth',{isLocalDevHost:async()=>false,requireAuth:async()=>({userId:user.clerkUserId})});
 stub('../lib/workspace-access',{assertWorkspaceAccess:async(_id:string,workspaceId:string)=>{assert(await db.workspace.findFirst({where:{id:workspaceId,userId:user.id}}));}});
 stub('../lib/workspace-summary-cache',{invalidateWorkspaceSummaryCache:()=>{}});
 stub('next/cache',{revalidateTag:()=>{}});
 try{
  const {PATCH}=await import('../app/api/transactions/[transactionId]/route');
  const workspace=await db.workspace.create({data:{userId:user.id,name:'Disposable line item checks'}});
  const account=await db.account.create({data:{workspaceId:workspace.id,name:'Fixture',currency:'USD',type:'bank',balance:'500'}});
  const rawPayload={receiptLineItems:[{description:'Original receipt item',amount:'20',currency:'USD'}],evidence:'Never alter source'};
  const transaction=await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date('2026-10-24'),amount:'99.50',type:'expense',currency:'USD',merchantRaw:'Confirmed receipt',reviewStatus:'confirmed',rawPayload,normalizedPayload:{userNote:'Preserve this note'}}});
  const send=(body:unknown,id=transaction.id)=>PATCH(new Request('https://clover.test/api/transactions/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({transactionId:id})});
  const addition=(description:string)=>({appendReceiptLineItem:{requestId:randomUUID(),item:{description,amount:'10',currency:'USD'}}});
  const first=addition('First'),second=addition('Second');
  const responses=await Promise.all([send(first),send(second)]);
  for(const response of responses)assert.equal(response.status,200,await response.clone().text());
  const retry=await send(first);assert.equal(retry.status,200);
  const result=await db.transaction.findUniqueOrThrow({where:{id:transaction.id}});
  assert.equal(result.amount.toString(),'99.5');assert.equal(result.currency,'USD');assert.equal(result.reviewStatus,'confirmed');assert.equal(result.merchantRaw,'Confirmed receipt');assert.deepEqual(result.rawPayload,rawPayload);
  const normalized=result.normalizedPayload as {receiptLineItems:{description:string}[];userNote:string};
  assert.equal(normalized.userNote,'Preserve this note');assert.equal(normalized.receiptLineItems.length,3);assert.deepEqual(new Set(normalized.receiptLineItems.map(item=>item.description)),new Set(['Original receipt item','First','Second']));
  assert.equal(await db.auditLog.count({where:{entityId:transaction.id,action:'transaction_line_item_added'}}),2);
  const before=JSON.stringify(result);
  assert.equal((await send({...addition('Invalid'),amount:'500'})).status,400);
  assert.equal((await send({appendReceiptLineItem:{...first.appendReceiptLineItem,requestId:'invalid'}})).status,400);
  assert.equal(JSON.stringify(await db.transaction.findUnique({where:{id:transaction.id}})),before);
  console.log('PASS: real PATCH concurrent append + retry, source/total/review preservation, audit and invalid payload safety.');
 }finally{for(const[id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
