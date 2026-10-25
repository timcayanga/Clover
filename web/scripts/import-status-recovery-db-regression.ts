import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??"55441");assert.equal(url.pathname,"/clover_migration_qa");assert(process.argv.includes("--execute"));
let network=0;globalThis.fetch=async()=>{network++;throw new Error("Status recovery QA prohibits providers");};
async function main(){
 const {prisma:db}=await import("../lib/prisma");
 const {queueStaleEmptyImportRecovery:queue,recoverFailedImportResume:recover}=await import("../lib/import-resume-recovery");
 const {setImportUserControl}=await import("../lib/import-user-control");
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+"@example.invalid",environment:"staging"}});
 try{
  const workspace=await db.workspace.create({data:{userId:user.id,name:"Status recovery QA"}});
  const file=()=>db.importFile.create({data:{workspaceId:workspace.id,fileName:"original.pdf",fileType:"application/pdf",storageKey:"qa/"+randomUUID(),sourceFingerprint:"a".repeat(64),status:"done",processingPhase:"complete",updatedAt:new Date(Date.now()-600000)}});
  const empty=await file();
  const claims=await Promise.all([queue(empty.id,empty.updatedAt),queue(empty.id,empty.updatedAt)]);
  assert.equal(claims.filter(Boolean).length,1,"Concurrent progress polls queue an empty completion once");
  const queued=await db.importFile.findUniqueOrThrow({where:{id:empty.id}});
  assert.equal(queued.status,"processing");assert.equal(queued.processingPhase,"queued_retry");assert.equal(queued.storageKey,empty.storageKey);assert.equal(queued.sourceFingerprint,empty.sourceFingerprint);
  assert.equal(await queue(empty.id,empty.updatedAt),false);
  assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:empty.id}}),queued);
  const changed=await file();
  const newer=await db.importFile.update({where:{id:changed.id},data:{fileName:"Renamed by user"}});
  assert.equal(await queue(changed.id,changed.updatedAt),false);assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:changed.id}}),newer);
  assert.equal(await queue(changed.id,new Date("invalid")),false);
  for(const phase of ["non_financial","source_review_required","receipt_review_required","password_required","account_match_needs_confirmation","pause_requested","paused","cancel_requested","cancelled"]){
   const before=await db.importFile.update({where:{id:(await file()).id},data:{processingPhase:phase}});
   assert.equal(await queue(before.id,before.updatedAt),false);assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:before.id}}),before);
  }
  for(const action of ["pause","cancel"] as const){
   const candidate=await file();await db.importFile.update({where:{id:candidate.id},data:{status:"processing"}});await setImportUserControl(candidate.id,user.clerkUserId,action);
   const before=await db.importFile.update({where:{id:candidate.id},data:{status:"done",processingPhase:"complete"}});
   assert.equal(await queue(before.id,before.updatedAt),false,"Durable controls win even when an old writer changed the phase");assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:before.id}}),before);
  }
  for(const protectedField of ["confirmedAt","rawPurgedAt"] as const){
   const before=await db.importFile.update({where:{id:(await file()).id},data:{[protectedField]:new Date()}});
   assert.equal(await queue(before.id,before.updatedAt),false);assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:before.id}}),before);
  }
  const account=await db.account.create({data:{workspaceId:workspace.id,name:"Confirmed bank",type:"bank",currency:"PHP",balance:"123.45"}});
  for(const legacy of [false,true])for(const deleted of [false,true]){
   const candidate=await file();const row=await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,importFileId:legacy?null:candidate.id,rawPayload:legacy?{sourceImportFileId:candidate.id}:undefined,date:new Date("2026-10-20"),amount:"50",currency:"PHP",type:"expense",merchantRaw:"Protected purchase",reviewStatus:"edited",deletedAt:deleted?new Date():null}});
   assert.equal(await queue(candidate.id,candidate.updatedAt),false);assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:candidate.id}}),candidate);assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:row.id}}),row);
  }
  const parsedFile=await file();const parsed=await db.parsedTransaction.create({data:{workspaceId:workspace.id,importFileId:parsedFile.id,merchantRaw:"Printed receipt",amount:"50",rawPayload:{sourceLine:"Printed total 50.00"}}});
  assert.equal(await queue(parsedFile.id,parsedFile.updatedAt),false,"A stale zero counter must not hide actual parsed evidence");assert.deepEqual(await db.parsedTransaction.findUniqueOrThrow({where:{id:parsed.id}}),parsed);
  const receipt=await db.importFile.update({where:{id:(await file()).id},data:{status:"processing",processingPhase:"reading_receipt_vision"}});
  const retries=await Promise.all([queue(receipt.id,receipt.updatedAt,{expectedStatus:"processing",nextAttempt:1}),queue(receipt.id,receipt.updatedAt,{expectedStatus:"processing",nextAttempt:1})]);
  assert.equal(retries.filter(Boolean).length,1);const retried=await db.importFile.findUniqueOrThrow({where:{id:receipt.id}});assert.equal(retried.processingAttempt,1);assert.equal(retried.processingPhase,"queued_retry");
  assert.equal(await queue(receipt.id,retried.updatedAt,{expectedStatus:"processing",nextAttempt:9}),false,"Retry attempts cannot jump or be consumed by duplicate polls");
  assert.equal((await recover(receipt.id,receipt.updatedAt)).kind,"preserved","Exhaustion handling cannot overwrite a newer worker heartbeat");assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:receipt.id}}),retried);
  assert.deepEqual(await db.account.findUniqueOrThrow({where:{id:account.id}}),account);assert.equal(network,0);
  console.log("Status recovery: concurrent single claim, stale snapshot/input/control/purged/confirmed/parsed/saved/deleted guards, preserved source hashes and bounded receipt attempts passed.");
 }finally{await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
