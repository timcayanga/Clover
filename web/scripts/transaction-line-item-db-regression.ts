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
  const {GET,PATCH}=await import('../app/api/transactions/[transactionId]/route');
  const workspace=await db.workspace.create({data:{userId:user.id,name:'Disposable line item checks'}});
  const account=await db.account.create({data:{workspaceId:workspace.id,name:'Fixture',currency:'USD',type:'bank',balance:'500'}});
  const rawPayload={receiptLineItems:[{description:'Original receipt item',amount:'20',currency:'USD'}],evidence:'Never alter source'};
  const transaction=await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date('2026-10-24'),amount:'99.50',type:'expense',currency:'USD',merchantRaw:'Confirmed receipt',reviewStatus:'confirmed',rawPayload,normalizedPayload:{userNote:'Preserve this note'}}});
  const send=(body:unknown,id=transaction.id)=>PATCH(new Request('https://clover.test/api/transactions/'+id,{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'https://clover.test'},body:JSON.stringify(body)}),{params:Promise.resolve({transactionId:id})});
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
  const matchData = { workspaceId: workspace.id, accountId: account.id, amount: "75.50", currency: "USD",
    type: "expense" as const, reviewStatus: "confirmed" as const, date: new Date("2026-10-24") };
  const manual = await db.transaction.create({ data: { ...matchData, merchantRaw: "Market Square", normalizedPayload: { userNote: "keep" } } });
  const soa = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "statement.pdf", fileType: "application/pdf", storageKey: randomUUID() } });
  const statement = await db.transaction.create({ data: { ...matchData, importFileId: soa.id, merchantRaw: "POS MARKET SQUARE INC" } });
  const receiptFile = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "receipt.png", fileType: "image/png", storageKey: randomUUID() } });
  const receipt = await db.transaction.create({ data: { ...matchData, importFileId: receiptFile.id, merchantRaw: "Market Square Grocery",
    rawPayload: { source: "receipt", receiptLineItems: [{ description: "Groceries", amount: "75.50", currency: "USD" }] } } });
  const unrelated = await db.transaction.create({ data: { ...matchData, merchantRaw: "Another store" } });
  const detail = async (id: string) => {
    const response = await GET(new Request("https://clover.test/api/transactions/" + id), { params: Promise.resolve({ transactionId: id }) });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).transaction;
  };
  const matches = (await detail(statement.id)).sourceMatches;
  assert(matches.some((match: {id:string;canCopyLineItems:boolean}) => match.id === receipt.id && match.canCopyLineItems));
  assert(matches.some((match: {id:string}) => match.id === manual.id));
  assert(!matches.some((match: {id:string}) => match.id === unrelated.id));
  const timed = await db.transaction.create({ data: { ...matchData, amount: "68.50", importFileId: soa.id, merchantRaw: "Unfamiliar descriptor",
    rawPayload: { transactionTime: "13:45" } } });
  const timedReceipt = await db.transaction.create({ data: { ...matchData, amount: "68.50", importFileId: receiptFile.id, merchantRaw: "Market Square",
    rawPayload: { source: "receipt", receiptDetails: { transactionTime: "13:49" } } } });
  assert((await detail(timed.id)).sourceMatches.some((match: {id:string;evidence:string[]}) => match.id === timedReceipt.id && match.evidence.includes("Similar payment time")));
  const ikea = await db.transaction.create({ data: { ...matchData, amount: "123.45", merchantRaw: "IKEA" } });
  const ikeaStatement = await db.transaction.create({ data: { ...matchData, amount: "123.45", merchantRaw: "PAYPAL * SQ * IKEA TID A771", importFileId: soa.id } });
  const otherIkeaAccount = await db.account.create({ data: { workspaceId: workspace.id, name: "Another card", currency: "USD", type: "credit_card" } });
  const ikeaWrongAccount = await db.transaction.create({ data: { ...matchData, amount: "123.45", merchantRaw: "PAYPAL * IKEA", importFileId: soa.id, accountId: otherIkeaAccount.id } });
  const ikeaMatches = (await detail(ikea.id)).sourceMatches;
  assert(ikeaMatches.some((match: {id:string}) => match.id === ikeaStatement.id));
  assert(!ikeaMatches.some((match: {id:string}) => match.id === ikeaWrongAccount.id));
  const secondSoa = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "overlapping-statement.pdf", fileType: "application/pdf", storageKey: randomUUID() } });
  const overlapData = { ...matchData, amount: "118.50", merchantRaw: "Market Square",
    rawPayload: { referenceNumber: "RP-7791182457" } };
  const firstOverlap = await db.transaction.create({ data: { ...overlapData, importFileId: soa.id } });
  const secondOverlap = await db.transaction.create({ data: { ...overlapData, importFileId: secondSoa.id, date: new Date("2026-10-26") } });
  const sameFileRepeat = await db.transaction.create({ data: { ...overlapData, importFileId: soa.id } });
  const weakOverlap = await db.transaction.create({ data: { ...overlapData, importFileId: secondSoa.id, rawPayload: {} } });
  const overlapMatches = (await detail(firstOverlap.id)).sourceMatches;
  assert(overlapMatches.some((match: {id:string;evidence:string[]}) => match.id === secondOverlap.id && match.evidence.includes("Matching payment reference")));
  assert(!overlapMatches.some((match: {id:string}) => [sameFileRepeat.id, weakOverlap.id].includes(match.id)));
  const fxStatement = await db.transaction.create({ data: { ...matchData, amount: "42", currency: "USD", importFileId: soa.id,
    merchantRaw: "Payment processor", date: new Date("2026-10-27"),
    rawPayload: { originalAmount: 6500, originalCurrency: "JPY", approvalCode: "395719" } } });
  const fxReceipt = await db.transaction.create({ data: { ...matchData, amount: "6500", currency: "JPY", importFileId: receiptFile.id,
    merchantRaw: "Tokyo Books", rawPayload: { source: "receipt", receiptDetails: { authorization_code: "395719" },
      receiptLineItems: [{ description: "Book", amount: "6500", currency: "JPY" }] } } });
  const differentAuth = await db.transaction.create({ data: { ...matchData, amount: "6500", currency: "JPY", importFileId: receiptFile.id,
    merchantRaw: "Payment processor", date: new Date("2026-10-27"),
    rawPayload: { source: "receipt", receiptDetails: { authorization_code: "395718" } } } });
  const fxMatches = (await detail(fxStatement.id)).sourceMatches;
  assert(fxMatches.some((match: {id:string;canCopyLineItems:boolean}) => match.id === fxReceipt.id && !match.canCopyLineItems));
  assert(!fxMatches.some((match: {id:string}) => match.id === differentAuth.id));
  assert((await detail(fxReceipt.id)).sourceMatches.some((match: {id:string}) => match.id === fxStatement.id));
  assert.equal((await send({ copyReceiptFromTransactionId: fxReceipt.id }, fxStatement.id)).status, 409);
  const confirm = { confirmSourceMatchId: fxReceipt.id };
  const confirmations = await Promise.all([send(confirm, fxStatement.id), send(confirm, fxStatement.id)]);
  for (const response of confirmations) assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await db.auditLog.count({ where: { entityId: fxStatement.id, action: "transaction_source_match_confirmed" } }), 1);
  assert((await detail(fxReceipt.id)).sourceMatches.some((match: { id: string; confirmed: boolean }) => match.id === fxStatement.id && match.confirmed));
  assert.deepEqual(await db.transaction.findUnique({ where: { id: fxStatement.id } }), fxStatement);
  await db.transaction.update({ where: { id: fxReceipt.id }, data: { date: new Date("2026-10-12") } });
  assert((await detail(fxStatement.id)).sourceMatches.some((match: { id: string; confirmed: boolean }) => match.id === fxReceipt.id && match.confirmed));
  assert.equal((await send({ dismissSourceMatchId: fxStatement.id }, fxReceipt.id)).status, 200);
  assert(!(await detail(fxStatement.id)).sourceMatches.some((match: { id: string }) => match.id === fxReceipt.id));
  const dismiss = { dismissSourceMatchId: manual.id };
  const dismissals = await Promise.all([send(dismiss, statement.id), send(dismiss, statement.id)]);
  for (const response of dismissals) assert.equal(response.status, 200, await response.clone().text());
  assert(!(await detail(statement.id)).sourceMatches.some((match: { id: string }) => match.id === manual.id));
  assert(!(await detail(manual.id)).sourceMatches.some((match: { id: string }) => match.id === statement.id));
  assert.equal(await db.auditLog.count({ where: { entityId: statement.id, action: "transaction_source_match_dismissed" } }), 1);
  assert.deepEqual(await db.transaction.findUnique({ where: { id: manual.id } }), manual);
  assert.deepEqual(await db.transaction.findUnique({ where: { id: statement.id } }), statement);
  const copy = { copyReceiptFromTransactionId: receipt.id };
  const copies = await Promise.all([send(copy, statement.id), send(copy, statement.id)]);
  for (const response of copies) assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await db.auditLog.count({where:{entityId:statement.id,action:"transaction_receipt_items_copied"}}), 1);
  const updated = await db.transaction.findUniqueOrThrow({ where: { id: statement.id } });
  assert.equal(updated.amount.toString(), "75.5");
  assert.equal(updated.reviewStatus, "confirmed");
  assert.equal(updated.accountId, statement.accountId);
  assert.equal(updated.importFileId, soa.id);
  assert.deepEqual(updated.rawPayload, statement.rawPayload);
  assert.deepEqual(await db.transaction.findUnique({ where: { id: receipt.id } }), receipt);
  assert.equal((await send(copy, unrelated.id)).status, 409);
  console.log('PASS: real PATCH concurrent append + retry, source/total/review preservation, audit and invalid payload safety.');
 }finally{for(const[id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
