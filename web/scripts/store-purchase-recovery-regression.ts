import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";
import { SignedDataVerifier, Environment } from "@apple/app-store-server-library";
import { appleStoreRoot } from "../lib/apple-store-root";
import { NativeInputError } from "../lib/native-input-error";
const source = fs.readFileSync(new URL("../lib/store-purchase-recovery.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const target = "user_target", old = "user_deleted", signed = "header.payload.signature";
function harness(options: Record<string, boolean> = {}) {
  let owner = options.alreadyRecovered ? target : old;
  let audit: Record<string, unknown> | null = options.reservedElsewhere ? { targetClerkUserId: "user_other", environment: "production" } : null;
  const calls: string[] = [];
  const tx = {
    $executeRaw: async () => {},
    user: { findUnique: async ({where}: any) => where.id ? {id:"target"} : options.sourceLive ? {id:"old"} : null },
    clerkIdentityDeletion: { findUnique: async ({where}: any) => where.clerkUserId === target ? options.targetDeleted ? {completedAt:new Date()} : null : options.notDeleted ? null : {completedAt:options.incomplete ? null : new Date(),environment:options.wrongEnvironment ? "staging" : "production"} },
    storePurchaseRecovery: {updateMany:async({data}:any)=>{if(audit)Object.assign(audit,data);},findUnique:async()=>audit,create:async({data}:any)=>{audit=data;},update:async({data}:any)=>{Object.assign(audit!,data);}},
    storeAccess: {findUnique:async()=>options.targetPaid ? {expiresAt:new Date(Date.now()+60000)} : null},
  };
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, Buffer, Date, Error, JSON, AbortSignal, encodeURIComponent,
    process: {env:{REVENUECAT_RECOVERY_API_KEY:options.disabled ? "" : "server-only"}},
    fetch: async (url:string, init:any) => {
      assert.equal(init.headers.Authorization, "Bearer server-only");
      if(url.includes("actions/transfer")) {
        calls.push("transfer");
        assert.deepEqual(JSON.parse(init.body), {target_customer_id:target,app_ids:["app1b9b72f65f"]});
        owner=target;
        if(options.unknownOutcome){options.unknownOutcome=false;throw new Error("Connection lost");}
        return {ok:true,status:204};
      }
      assert(url.endsWith("subscriptions?store_subscription_identifier=12345"));
      return {ok:true,status:200,json:async()=>({items:[{customer_id:owner,store:options.wrongStore?"play_store":"app_store",environment:"production",ownership:options.shared?"family_shared":"purchased"}]})};
    },
    require:(name:string)=> {
      if(name==="node:crypto")return {createHash};
      if(name==="@apple/app-store-server-library")return {Environment,SignedDataVerifier:class {async verifyAndDecodeTransaction(){if(options.invalidProof)throw new Error("invalid signature");return {transactionId:"12345",originalTransactionId:"123",productId:options.wrongProduct?"other":"clover.plus.monthly",inAppOwnershipType:"PURCHASED",type:"Auto-Renewable Subscription",revocationDate:options.refunded?1:undefined};}}};
      if(name==="@clerk/nextjs/server")return {clerkClient:async()=>({users:{getUser:async()=>{if(options.providerLive)return {};throw {status:404};}}})};
      if(name==="../../shared/store-catalog")return {STORE_PACKAGES:[{ios:"clover.plus.monthly"}]};
      if(name==="./apple-store-root")return {appleStoreRoot};
      if(name==="./prisma")return {prisma:{...tx,user:{findUniqueOrThrow:async()=>({clerkUserId:target,environment:"production"})},$transaction:async(fn:any)=>fn(tx)}};
      if(name==="./store-access")return {storeBillingConfig:()=>({enabled:true,sandbox:false,sandboxAppUserIds:[]}),syncStoreAccess:async()=>{calls.push("sync");}};
      if(name==="./deployment-environment")return {getDeploymentEnvironment:()=>"production"};
      if(name==="./native-input-error")return {NativeInputError};
      if(name==="./rate-limit")return {assertRateLimit:()=>{}};
      throw new Error(name);
    },
  });
  return {run:()=>exports.recoverDeletedStorePurchase("target",signed), calls,getAudit:()=>audit};
}
async function main(){
  for(const issue of ["disabled","invalidProof","wrongProduct","refunded","wrongStore","shared","providerLive","sourceLive","notDeleted","incomplete","wrongEnvironment","targetDeleted","targetPaid","reservedElsewhere"]){
    const h=harness({[issue]:true});await assert.rejects(h.run());assert(!h.calls.includes("transfer"),issue);assert(!h.calls.includes("sync"),issue);
  }
  const success=harness();await success.run();assert.deepEqual(success.calls,["transfer","sync"]);assert(success.getAudit()?.completedAt);
  await success.run();assert.equal(success.calls.filter(x=>x==="transfer").length,1);
  const retry=harness({unknownOutcome:true});await assert.rejects(retry.run());assert(retry.getAudit());await retry.run();assert.deepEqual(retry.calls,["transfer","sync"]);
  const verifier=new SignedDataVerifier([appleStoreRoot],false,Environment.PRODUCTION,"ph.clover.app",6811711508);
  await assert.rejects(verifier.verifyAndDecodeTransaction(signed));
  const forged=Buffer.from(JSON.stringify({alg:"ES256",x5c:[]})).toString("base64url")+"."+Buffer.from(JSON.stringify({bundleId:"ph.clover.app",transactionId:"12345",environment:"Production"})).toString("base64url")+".Zm9yZ2Vk";
  await assert.rejects(verifier.verifyAndDecodeTransaction(forged));
  console.log("PASS deleted purchase recovery: signed proof, owner/deletion/environment guards, app-scoped transfer, repeat and unknown-outcome retry");
}
void main();
