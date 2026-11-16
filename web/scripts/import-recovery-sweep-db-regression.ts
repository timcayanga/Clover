import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SourceReviewRequiredError, SOURCE_REVIEW_PHASE } from "../lib/import-source-review";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);
let network = 0;
globalThis.fetch = async () => { network++; throw new Error("Recovery QA prohibits providers"); };

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { persistSourceReviewFailure } = await import("../lib/import-source-review.server");
  const { setImportUserControl } = await import("../lib/import-user-control");
  const user = await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+"@example.invalid",environment:"staging"}});
  const workerPath = require.resolve("../workers/import-processor");
  const prior = require.cache[workerPath];
  let calls = 0; let confirms = 0;
  let behavior: "source" | "timeout" | "cancel" | "success" = "source";
  const refusal = new SourceReviewRequiredError("Native source requires review: contradictory synthetic ledger");
  require.cache[workerPath] = { id:workerPath,filename:workerPath,loaded:true,exports:{
    processImportFileText: async (id: string, options: {autoRerunAttempt?:number}) => {
      assert.equal(options.autoRerunAttempt,(await db.importFile.findUniqueOrThrow({where:{id}})).processingAttempt,"Scheduled retries preserve their durable attempt budget");
      calls++;
      if (behavior === "source") { await persistSourceReviewFailure(id,refusal);throw refusal; }
      if (behavior === "cancel") { await setImportUserControl(id,user.clerkUserId,"cancel");throw new Error("Late timeout"); }
      if (behavior === "timeout") throw new Error("Provider timeout");
      await db.importFile.update({where:{id},data:{status:"done",processingPhase:"complete"}});
      return {status:"done",imported:0,confirmedTransactionsCount:0};
    },
    confirmImportFile: async (id: string) => { confirms++;await db.importFile.update({where:{id},data:{status:"done",processingPhase:"complete"}});return {status:"done",imported:0}; },
    processImportEnrichmentJobs: async () => ({processedJobs:0,results:[]}),
  }} as NodeModule;
  try {
    const { runImportRecoverySweep } = await import("../lib/import-recovery-sweep");
    const workspace = await db.workspace.create({data:{userId:user.id,name:"Scheduled recovery QA"}});
    const other = await db.workspace.create({data:{userId:user.id,name:"Other Profile"}});
    const account = await db.account.create({data:{workspaceId:workspace.id,name:"Confirmed account",type:"bank",currency:"PHP",balance:"432.10"}});
    const confirmed = await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date("2026-10-20"),amount:"50",currency:"PHP",type:"expense",merchantRaw:"User edit",reviewStatus:"edited"}});
    const snapshot = async () => JSON.stringify([await db.account.findUniqueOrThrow({where:{id:account.id}}),await db.transaction.findUniqueOrThrow({where:{id:confirmed.id}})]);
    const financialBefore = await snapshot();
    const stale = () => new Date(Date.now()-10*60_000);
    const makeFile = (processingPhase="queued_retry") => db.importFile.create({data:{workspaceId:workspace.id,fileName:"invented.pdf",fileType:"application/pdf",storageKey:"qa/"+randomUUID(),status:"processing",processingPhase,updatedAt:stale()}});
    const sweep = () => runImportRecoverySweep({importLimit:3,enrichmentLimit:1,workerId:"isolated-qa"});
    const source = await makeFile();
    const refused = await sweep();assert.equal(refused.claimedImports,1);assert.equal(refused.recoveredImports[0].action,"held_for_review");
    const held = await db.importFile.findUniqueOrThrow({where:{id:source.id}});assert.equal(held.status,"failed");assert.equal(held.processingPhase,SOURCE_REVIEW_PHASE);
    assert.equal((await sweep()).claimedImports,0);assert.equal(calls,1,"A scheduled source refusal must not be retried repeatedly");
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:source.id}}),held);

    behavior="timeout";
    const failed = await makeFile();
    const usage = await db.auditLog.create({data:{workspaceId:workspace.id,actorUserId:user.clerkUserId,entity:"ImportFile",entityId:failed.id,action:"import.openai_model_call",metadata:{model:"unknown-test-model",totalTokens:900}}});
    const usageBefore = await db.auditLog.findUniqueOrThrow({where:{id:usage.id}});
    const timedOut = await sweep();assert.equal(timedOut.recoveredImports[0].action,"retry_available");
    const retry = await db.importFile.findUniqueOrThrow({where:{id:failed.id}});assert.equal(retry.status,"failed");assert.equal(retry.processingPhase,"repair_needed");
    assert.equal(await db.auditLog.count({where:{entityId:failed.id,action:"import.ai_usage_credit"}}),1);
    assert.deepEqual(await db.auditLog.findUniqueOrThrow({where:{id:usage.id}}),usageBefore);
    assert.equal((await sweep()).claimedImports,0);assert.equal(calls,2);
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:failed.id}}),retry);

    for (const action of ["pause","cancel"] as const) {
      const file = await makeFile();await setImportUserControl(file.id,user.clerkUserId,action);
      // Reproduce an old progress write while retaining the authoritative audit.
      await db.importFile.update({where:{id:file.id},data:{status:"processing",processingPhase:"queued_retry",updatedAt:stale()}});
      const before = await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      assert.equal((await sweep()).claimedImports,0,"Durable controls must exclude stale files before claiming");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),before);
    }
    behavior="cancel";const cancelling=await makeFile();
    assert.equal((await sweep()).recoveredImports[0].action,"user_control");
    const cancelled=await db.importFile.findUniqueOrThrow({where:{id:cancelling.id}});assert.equal(cancelled.status,"failed");assert.equal(cancelled.processingPhase,"cancelled");
    assert.equal((await sweep()).claimedImports,0);

    for (const legacy of [false,true]) for (const deleted of [false,true]) {
      const file=await makeFile();
      const row=await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,importFileId:legacy?null:file.id,rawPayload:legacy?{sourceImportFileId:file.id}:undefined,date:new Date("2026-10-20"),amount:"20",currency:"PHP",type:"expense",merchantRaw:"Protected history",reviewStatus:"edited",deletedAt:deleted?new Date():null}});
      const before=await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      assert.equal((await sweep()).claimedImports,0,"Direct/legacy and deleted saved rows must exclude reprocessing");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),before);
      assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:row.id}}),row);
    }
    for (const phase of [SOURCE_REVIEW_PHASE,"receipt_review_required","password_required","account_match_needs_confirmation"]) {
      const file=await makeFile(phase);assert.equal((await sweep()).claimedImports,0);
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),file);
    }
    const count=db.transaction.count;
    const lookupFailure=await makeFile();
    Object.assign(db.transaction,{count:async()=>{throw new Error("Injected count failure");}});
    const callsBefore=calls;
    try {const result=await sweep();assert.equal(result.recoveredImports[0].action,"retry_available");assert.equal(result.recoveredImports[0].visibleRows,null);}
    finally {Object.assign(db.transaction,{count});}
    assert.equal(calls,callsBefore,"Failed saved-row lookup must never start OCR or AI");
    assert.equal((await db.importFile.findUniqueOrThrow({where:{id:lookupFailure.id}})).status,"failed");

    const checkpointFailure=await makeFile();
    const findCheckpoint=db.accountStatementCheckpoint.findUnique;
    Object.assign(db.accountStatementCheckpoint,{findUnique:async()=>{throw new Error("Injected checkpoint failure");}});
    try {assert.equal((await sweep()).recoveredImports[0].action,"retry_available");}
    finally {Object.assign(db.accountStatementCheckpoint,{findUnique:findCheckpoint});}
    assert.equal(calls,callsBefore,"Failed mode lookup must not silently default to a new parser run");
    assert.equal((await db.importFile.findUniqueOrThrow({where:{id:checkpointFailure.id}})).status,"failed");

    const checkpointed=await makeFile();
    const parsed=await db.parsedTransaction.create({data:{workspaceId:workspace.id,importFileId:checkpointed.id,merchantRaw:"Read receipt",amount:"50",currency:"PHP",date:new Date("2026-10-20"),rawPayload:{sourceLine:"Printed total PHP 50.00"}}});
    const reused=await sweep();assert.equal(reused.recoveredImports[0].action,"confirmed_checkpoint");
    assert.equal(confirms,1);assert.equal(calls,callsBefore,"Saved parsed rows must be confirmed before another extraction attempt");
    assert.deepEqual(await db.parsedTransaction.findUniqueOrThrow({where:{id:parsed.id}}),parsed,"Checkpoint reuse preserves original parsed evidence");

    const staleParsed=await makeFile();
    const retainedParsed=await db.parsedTransaction.create({data:{workspaceId:workspace.id,importFileId:staleParsed.id,merchantRaw:"Retained checkpoint",amount:"75",currency:"PHP",rawPayload:{sourceLine:"Printed total PHP 75.00"}}});
    const rawQuery=db.$queryRawUnsafe.bind(db);
    Object.assign(db,{$queryRawUnsafe:async(query:string,...values:unknown[])=>{
      if(query.includes('FROM "ParsedTransaction"') && query.includes("COUNT(*)")) throw new Error("Injected parsed-row count failure");
      return rawQuery(query,...values);
    }});
    try {assert.equal((await sweep()).recoveredImports[0].action,"retry_available");}
    finally {Object.assign(db,{$queryRawUnsafe:rawQuery});}
    const retainedFile=await db.importFile.findUniqueOrThrow({where:{id:staleParsed.id}});
    assert.equal(retainedFile.status,"failed");assert.equal(retainedFile.parsedRowsCount,1,"Retry metadata retains actual parsed rows for checkpoint reuse");
    assert.deepEqual(await db.parsedTransaction.findUniqueOrThrow({where:{id:retainedParsed.id}}),retainedParsed);assert.equal(calls,callsBefore);

    behavior="success";const scoped=await makeFile();
    await db.auditLog.create({data:{workspaceId:other.id,actorUserId:user.clerkUserId,entity:"ImportFile",entityId:scoped.id,action:"import.user_control",metadata:{control:"cancelled"}}});
    assert.equal((await sweep()).claimedImports,1,"Another Profile's audit cannot control this import");
    assert.equal(calls,callsBefore+1);assert.equal(confirms,1);
    const concurrent=await db.importFile.update({where:{id:(await makeFile()).id},data:{processingAttempt:2,updatedAt:stale()}});
    const paired=await Promise.all([sweep(),sweep()]);
    assert.equal(paired.reduce((sum,result)=>sum+result.claimedImports,0),1,"Simultaneous sweeps claim one stale import only once");
    assert.equal(calls,callsBefore+2);
    assert.equal((await db.importFile.findUniqueOrThrow({where:{id:concurrent.id}})).status,"done");
    assert.equal(await snapshot(),financialBefore);
    assert.equal(await db.parsedTransaction.count({where:{workspaceId:workspace.id}}),2);
    assert.equal(network,0);
    console.log("Scheduled recovery: single source refusal, terminal failed retry with one usage credit, control/held/saved/deleted exclusions, lookup-failure safety and Profile scoping passed.");
  } finally {
    if(prior)require.cache[workerPath]=prior;else delete require.cache[workerPath];
    await db.user.delete({where:{id:user.id}});await db.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
