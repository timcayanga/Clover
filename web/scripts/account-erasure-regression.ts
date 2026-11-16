import assert from "node:assert/strict";
import { erasePostHogData, eraseRevenueCatCustomer } from "../lib/account-erasure-providers";
import { eraseDetachedUserRecords } from "../lib/account-erasure-records";

async function main() {
  const calls: string[] = [];
  let saved: string[] = [], status = "pending", deleted = false, foreign = false;
  const analytics = {
    origin: "https://us.posthog.com", projectId: "fixture", key: "test-only",
    distinctIds: ["staging:user_deleted"], personIds: [] as string[],
    checkpoint: async (ids: string[]) => { saved = ids; },
    isLiveIdentity: async (id: string) => id === "staging:user_live",
  };
  const ph: typeof fetch = async (url, init) => {
    const u = new URL(String(url)); calls.push(`${init?.method} ${u.pathname}`);
    if (u.searchParams.has("distinct_id")) return Response.json({results: deleted ? [] : [{id: 42, uuid: "person-fixture", distinct_ids: ["staging:user_deleted", ...(foreign ? ["staging:user_live"] : [])]}]});
    if (u.pathname.includes("deletion_status")) return Response.json({results:[{person_uuid:"person-fixture",status}]});
    if (init?.method === "DELETE") {
      assert.deepEqual(saved,["person-fixture"],"checkpoint before potentially ambiguous DELETE result");
      assert.equal(u.searchParams.get("delete_events"),"true");
      assert.equal(u.searchParams.get("delete_recordings"),"true");
      deleted=true; return new Response(null,{status:202});
    }
    return deleted ? new Response(null,{status:404}) : Response.json({distinct_ids:["staging:user_deleted"]});
  };
  assert.equal((await erasePostHogData(analytics,ph)).pending,true,"accepted deletion is not completed deletion");
  status="completed";
  assert.equal((await erasePostHogData({...analytics,personIds:saved},ph)).pending,false,"retry polls saved UUID after person disappears");
  deleted=false; foreign=true; calls.length=0;
  await assert.rejects(()=>erasePostHogData(analytics,ph),/active account/);
  assert.ok(calls.every(call=>!call.startsWith("DELETE")));
  await assert.rejects(()=>erasePostHogData(analytics,async()=>new Response(null,{status:403})),/HTTP 403/);
  await assert.rejects(()=>erasePostHogData({...analytics,origin:"https://foreign.test"},ph),/host/);

  let rcExists=true, active=false, live=false, queued=0, deletionMarked=false;
  const rc: typeof fetch=async(url,init)=>{
    const path=new URL(String(url)).pathname;
    if(init?.method==="DELETE") {assert.equal(deletionMarked,true,"durable intent before remote deletion");queued++;return new Response("{}",{status:200});}
    if(!rcExists)return new Response(null,{status:404});
    if(path.endsWith("/aliases"))return Response.json({items:[{id:live?"user_live":"$RCAnonymousID:fixture"}]});
    return Response.json({active_entitlements:{items:active?[{entitlement_id:"plus"}]:[]}});
  };
  const revenuecat={appUserId:"user_deleted",key:"test-only",readKey:"test-only",projectId:"fixture",isLiveIdentity:async(id:string)=>id==="user_live",checkpoint:async()=>{deletionMarked=true;}};
  active=true; assert.equal(await eraseRevenueCatCustomer(revenuecat,rc),false); assert.equal(queued,0,"preserve paid-period recovery");
  active=false; live=true;
  await assert.rejects(()=>eraseRevenueCatCustomer(revenuecat,rc),/live identity/);assert.equal(queued,0);
  live=false; assert.equal(await eraseRevenueCatCustomer(revenuecat,rc),false);assert.equal(queued,1);
  rcExists=false;assert.equal(await eraseRevenueCatCustomer(revenuecat,rc),true);
  rcExists=true; deletionMarked=false;
  await assert.rejects(()=>eraseRevenueCatCustomer(revenuecat,async(url,init)=>{
    if(init?.method==="DELETE")throw Error("response lost after provider acceptance");
    return rc(url,init);
  }),/response lost/);
  assert.equal(deletionMarked,true,"unknown deletion outcome preserves the recovery guard");
  await assert.rejects(()=>eraseRevenueCatCustomer(revenuecat,async()=>new Response(null,{status:403})),/HTTP 403/);
  await assert.rejects(()=>eraseRevenueCatCustomer(revenuecat,async()=>Response.json({})),/entitlement state/);

  // Scope every detached-record deletion to this identity; keep the other user's reward.
  const operations: Array<{model:string;method:string;args:any}>=[];
  const db=new Proxy({}, {get:(_target,model:string)=>new Proxy({}, {get:(_delegate,method:string)=>async(args:any)=>{
    operations.push({model,method,args});
    if(model==="referralReward"&&method==="findMany")return [{id:"other-users-earned-reward"}];
    return {count:1};
  }})});
  const user={id:"local-deleted",clerkUserId:"user_deleted",email:"deleted@example.test",verified:true,environment:"staging"};
  await eraseDetachedUserRecords(db as any,user,["private-workspace"]);
  const op=(model:string,method="deleteMany")=>operations.find(o=>o.model===model&&o.method===method)!.args;
  assert.deepEqual(op("contactInquiry").where,{email:{equals:user.email,mode:"insensitive"},environment:"staging"});
  assert.deepEqual(op("brankasStatementNotificationEvent").where,{brankasStatementSession:{workspaceId:{in:["private-workspace"]}}});
  assert.deepEqual(op("referralReward").where,{referrerId:user.id});
  assert.equal(op("referralReward","update").where.id,"other-users-earned-reward");
  assert.match(op("referralReward","update").data.referredId,/^erased:/);
  assert.deepEqual(Object.keys(op("referralReward","update").data).sort(),["reason","referredId"],"do not change another person's reward amount, status or refund linkage");
  assert.deepEqual(op("auditLog","updateMany").where.workspaceId,{notIn:["private-workspace"]});
  operations.length=0;
  await eraseDetachedUserRecords(db as any,{...user,verified:false},[]);
  assert.ok(!operations.some(o=>o.model==="contactInquiry"),"unverified email cannot erase support correspondence");
  console.log("PASS account erasure: provider confirmation, retries, alias protection, paid recovery, scoped detached data and shared rewards");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
