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
globalThis.fetch = async () => { network++; throw new Error("Resume regression prohibits providers"); };

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID()+"@example.invalid", environment: "staging" } });
  const paths = ["../lib/auth", "../lib/workspace-access", "../workers/import-processor"].map(path => require.resolve(path));
  const prior = paths.map(path => require.cache[path]);
  let parserCalls = 0;
  let denyAuth = false; let denyWorkspace = false;
  let failure: Error | null = null;
  let controlOnParse: "pause" | "cancel" | null = null;
  const sourceError = new SourceReviewRequiredError("Native source requires review: GCash payment template mixes currencies and an unverified cash-in instruction; no reliable payment established");
  require.cache[paths[0]] = { id: paths[0], filename: paths[0], loaded: true, exports: {
    isLocalDevHost: async () => false, requireAuth: async () => { if (denyAuth) throw new Error("UNAUTHORIZED"); return { userId: user.clerkUserId }; },
  } } as NodeModule;
  require.cache[paths[1]] = { id: paths[1], filename: paths[1], loaded: true, exports: {
    assertWorkspaceAccess: async (_actor: string, id: string) => { if (denyWorkspace) throw new Error("WORKSPACE_NOT_FOUND"); assert(await db.workspace.findFirst({ where: { id, userId: user.id } })); },
  } } as NodeModule;
  require.cache[paths[2]] = { id: paths[2], filename: paths[2], loaded: true, exports: {
    processImportFileText: async (id: string, options: {autoRerunAttempt?:number}) => {
      assert.equal(options.autoRerunAttempt,(await db.importFile.findUniqueOrThrow({where:{id}})).processingAttempt,"Inline retries preserve their durable attempt budget");
      parserCalls++; await Promise.resolve();
      if (controlOnParse) {
        const { setImportUserControl } = await import("../lib/import-user-control");
        await setImportUserControl(id, user.clerkUserId, controlOnParse);
      }
      throw failure ?? sourceError;
    },
    confirmImportFile: async () => ({ imported: 0, status: "staged" }),
  } } as NodeModule;
  try {
    const { POST } = await import("../app/api/imports/[importId]/resume/route");
    for (const checkpointed of [false, true]) {
      const workspace = await db.workspace.create({ data: { userId: user.id, name: "Async source review "+checkpointed } });
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "invented-source.pdf", fileType: "application/pdf", storageKey: "qa/"+randomUUID(), status: "failed", processingPhase: "repair_needed" } });
      if (checkpointed) await db.accountStatementCheckpoint.create({ data: { workspaceId: workspace.id, importFileId: file.id, status: "reconciled", rowCount: 0 } });
      const response = await POST(new Request("https://staging.clover.ph/api/imports/"+file.id+"/resume", { method: "POST" }), { params: Promise.resolve({ importId: file.id }) });
      assert.equal(response.status, 422, "A rejection after await must reach the resume error handler");
      const payload = await response.json(); assert.equal(payload.code, "I-109"); assert.equal(payload.retryable, false);
      assert.equal(payload.diagnosticReason, sourceError.message); assert.match(payload.error, /conflicting currencies/);
      const before = await db.importFile.findUniqueOrThrow({ where: { id: file.id } });
      assert.equal(before.status, "failed"); assert.equal(before.processingPhase, SOURCE_REVIEW_PHASE);
      const calls = parserCalls;
      const repeat = await POST(new Request("https://staging.clover.ph/api/imports/"+file.id+"/resume", { method: "POST" }), { params: Promise.resolve({ importId: file.id }) });
      assert.equal(repeat.status, 422); assert.equal(parserCalls, calls, "Held retry must not invoke the parser again");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({ where: { id: file.id } }), before);
      assert.equal(await db.transaction.count({ where: { workspaceId: workspace.id } }), 0);
      assert.equal(await db.parsedTransaction.count({ where: { workspaceId: workspace.id } }), 0);
      assert.equal(await db.learningJob.count({ where: { workspaceId: workspace.id } }), 0);
    }
    assert.equal(parserCalls, 2, "Both inline resume paths are exercised");
    const { recoverFailedImportResume } = await import("../lib/import-resume-recovery");
    const workspace = await db.workspace.create({data:{userId:user.id,name:"Failed resume safety"}});
    const makeFile = (processingPhase = "repair_needed") => db.importFile.create({data:{workspaceId:workspace.id,fileName:"retry.pdf",fileType:"application/pdf",storageKey:"qa/"+randomUUID(),status:"failed",processingPhase}});
    const call = (id: string) => POST(new Request("https://staging.clover.ph/api/imports/"+id+"/resume",{method:"POST"}),{params:Promise.resolve({importId:id})});
    const protectedFile = await makeFile();
    const sourceBefore = await db.importFile.findUniqueOrThrow({where:{id:protectedFile.id}});
    const auditsBefore = await db.auditLog.count({where:{workspaceId:workspace.id}});
    denyAuth = true;
    assert.equal((await call(protectedFile.id)).status,401);denyAuth=false;
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:protectedFile.id}}),sourceBefore,"Sign-in failure must not mutate a known import ID");
    denyWorkspace = true;
    assert.equal((await call(protectedFile.id)).status,404);denyWorkspace=false;
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:protectedFile.id}}),sourceBefore,"Ownership failure must not mutate another Profile's import");
    assert.equal(await db.auditLog.count({where:{workspaceId:workspace.id}}),auditsBefore);
    assert.equal(parserCalls,2,"Unauthorized retries never invoke parsing");
    for (const phase of ["password_required","account_match_needs_confirmation"]) {
      const file = await makeFile(phase);
      const before = await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      const response = await call(file.id);assert.equal(response.status,409);
      const payload = await response.json();assert.equal(payload.retryable,false);
      assert.equal(payload.code,phase==="password_required"?"IMPORT_PASSWORD_REQUIRED":"IMPORT_ACCOUNT_CONFIRMATION_REQUIRED");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),before,"Required input must not be overwritten by a retry");
    }
    assert.equal(parserCalls,2,"Imports waiting for user input do not call the parser");
    failure = new Error("A generic provider timeout");
    for (const action of ["pause","cancel"] as const) {
      controlOnParse = action;
      const file = await makeFile();
      const response = await call(file.id); assert.equal(response.status,409);
      const payload = await response.json();assert.equal(payload.retryable,false);assert.equal(payload.control,action==="pause"?"paused":"cancelled");
      const after = await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      assert.equal(after.processingPhase,action==="pause"?"pause_requested":"cancelled");
      assert.equal(after.status,action==="pause"?"processing":"failed");
    }
    controlOnParse=null;
    const retry = await db.importFile.update({where:{id:(await makeFile()).id},data:{processingAttempt:2}});
    const usage = await db.auditLog.create({data:{workspaceId:workspace.id,actorUserId:user.clerkUserId,entity:"ImportFile",entityId:retry.id,action:"import.openai_model_call",metadata:{model:"unknown-test-model",totalTokens:1200}}});
    const usageBefore = await db.auditLog.findUniqueOrThrow({where:{id:usage.id}});
    const response = await call(retry.id);assert.equal(response.status,503);assert.equal((await response.json()).retryable,true);
    const retryState = await db.importFile.findUniqueOrThrow({where:{id:retry.id}});
    assert.equal(retryState.status,"failed");assert.equal(retryState.processingPhase,"repair_needed");
    const { needsNativeImportResume } = await import("../../shared/native-import-status");
    assert.equal(needsNativeImportResume({canResume:true,importFile:{status:retryState.status,processingPhase:retryState.processingPhase??undefined}}),false,"Existing mobile clients must not auto-requeue a failed attempt indefinitely");
    assert.equal(retryState.storageKey,retry.storageKey,"Retry keeps the original source reference");
    const credit = await db.auditLog.findUniqueOrThrow({where:{id:"import-ai-credit:"+usage.id}});
    assert.equal((credit.metadata as {cloverTokens:number}).cloverTokens,1200);
    assert.equal(await db.auditLog.count({where:{entityId:retry.id,action:"import.ai_usage_credit"}}),1);
    await recoverFailedImportResume(retry.id);
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:retry.id}}),retryState,"Repeated failure recovery preserves source and timestamps");
    assert.equal(await db.auditLog.count({where:{entityId:retry.id,action:"import.ai_usage_credit"}}),1,"Failed-import credit cannot be duplicated");
    assert.deepEqual(await db.auditLog.findUniqueOrThrow({where:{id:usage.id}}),usageBefore,"Provider usage audit is never erased or rewritten");
    for (const phase of [SOURCE_REVIEW_PHASE,"receipt_review_required","password_required","account_match_needs_confirmation","complete"]) {
      const file = await makeFile(phase);
      if (phase==="complete") await db.importFile.update({where:{id:file.id},data:{status:"done"}});
      const before = await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      assert.equal((await recoverFailedImportResume(file.id)).kind,"preserved");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),before);
    }
    const account = await db.account.create({data:{workspaceId:workspace.id,name:"Confirmed bank",type:"bank",currency:"PHP",balance:"543.21"}});
    for (const legacy of [false,true]) {
      const file = await makeFile();
      const transaction = await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,importFileId:legacy?null:file.id,date:new Date("2026-10-20"),amount:"123.45",currency:"PHP",type:"expense",merchantRaw:"Confirmed receipt",reviewStatus:"edited",rawPayload:legacy?{sourceImportFileId:file.id}:undefined,deletedAt:new Date("2026-10-21")}});
      const before = await db.importFile.findUniqueOrThrow({where:{id:file.id}});
      assert.equal((await recoverFailedImportResume(file.id)).kind,"preserved");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:file.id}}),before,"Direct and legacy soft-deleted records cannot be resurrected");
      assert.deepEqual(await db.transaction.findUniqueOrThrow({where:{id:transaction.id}}),transaction);
    }
    assert.deepEqual(await db.account.findUniqueOrThrow({where:{id:account.id}}),account);
    const racing = await makeFile();
    let acquired!:()=>void; let release!:()=>void;
    const locked = new Promise<void>(resolve=>{acquired=resolve;});
    const proceed = new Promise<void>(resolve=>{release=resolve;});
    const save = db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${racing.id} FOR UPDATE`;
      acquired();await proceed;
      await tx.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,importFileId:racing.id,date:new Date("2026-10-20"),amount:"50",currency:"PHP",type:"expense",merchantRaw:"Just saved",reviewStatus:"confirmed"}});
      return tx.importFile.update({where:{id:racing.id},data:{status:"done",processingPhase:"complete",confirmedTransactionsCount:1,confirmedAt:new Date()}});
    });
    await locked;
    const recovery = recoverFailedImportResume(racing.id);
    await new Promise(resolve=>setTimeout(resolve,50));release();
    const saved = await save;
    assert.equal((await recovery).kind,"preserved","A save committed while recovery waits wins the shared row lock");
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:racing.id}}),saved);
    assert.equal(await db.transaction.count({where:{importFileId:racing.id}}),1);

    // A database read failure must roll back instead of assuming zero saved rows.
    const failing = await makeFile();
    const originalTransaction = db.$transaction.bind(db);
    Object.assign(db,{$transaction: (run: (tx: unknown)=>unknown) => originalTransaction(async tx => run(new Proxy(tx,{get(target,key){
      if(key==="transaction") return {findFirst:async()=>{throw new Error("Injected saved-row lookup failure");}};
      const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
    }})))});
    try { await assert.rejects(recoverFailedImportResume(failing.id),/Injected saved-row lookup failure/); }
    finally { Object.assign(db,{$transaction:originalTransaction}); }
    assert.deepEqual(await db.importFile.findUniqueOrThrow({where:{id:failing.id}}),failing,"Lookup failures leave the source state unchanged");
    assert.equal(await db.auditLog.count({where:{entityId:failing.id,action:"import.ai_usage_credit"}}),0);
    assert.equal(parserCalls,5,"Only authorized, eligible retries invoke parsing");

  } finally {
    paths.forEach((path, i) => { if (prior[i]) require.cache[path] = prior[i]; else delete require.cache[path]; });
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
  assert.equal(network, 0);
  console.log("Resume API: auth/ownership refusal, generic timeout controls, repeat-safe usage credit, legacy deleted-row preservation, database rollback and source-review retry no-op passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
