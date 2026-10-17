import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname,"127.0.0.1");
assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname,"/clover_migration_qa");
assert(process.argv.includes("--execute"));
globalThis.fetch = async () => {throw new Error("External providers disabled during review QA");};
const require = createRequire(import.meta.url);
async function main() {
 const {prisma:db}=await import("../lib/prisma");
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+"@example.invalid",environment:"staging"}});
 const auth=require.resolve("../lib/auth"),access=require.resolve("../lib/workspace-access"),cache=require.resolve("../lib/workspace-summary-cache");
 const originals=[auth,access,cache].map(path=>require.cache[path]);
 require.cache[auth]={id:auth,filename:auth,loaded:true,exports:{isLocalDevHost:async()=>false,requireAuth:async()=>({userId:user.clerkUserId})}} as NodeModule;
 require.cache[access]={id:access,filename:access,loaded:true,exports:{assertWorkspaceAccess:async(_id:string,workspaceId:string)=>{assert(await db.workspace.findFirst({where:{id:workspaceId,userId:user.id}}));}}} as NodeModule;
 require.cache[cache]={id:cache,filename:cache,loaded:true,exports:{invalidateWorkspaceSummaryCache:()=>{}}} as NodeModule;
 try {
  const workspace=await db.workspace.create({data:{userId:user.id,name:"Native review QA"}});
  const other=await db.workspace.create({data:{userId:user.id,name:"Another Profile"}});
  const account=await db.account.create({data:{workspaceId:workspace.id,name:"BPI",institution:"BPI",type:"bank",currency:"PHP",balance:5000,source:"finverse"}});
  const otherAccount=await db.account.create({data:{workspaceId:other.id,name:"Other bank",type:"bank",currency:"PHP"}});
  const category=await db.category.create({data:{workspaceId:workspace.id,name:"Food & Dining",type:"expense"}});
  const base={workspaceId:workspace.id,accountId:account.id,categoryId:category.id,date:new Date(),amount:100,currency:"PHP",type:"expense" as const,parserConfidence:100,accountMatchConfidence:100,categoryConfidence:30,rawPayload:{source:"qa"}};
  await db.transaction.createMany({data:Array.from({length:57},(_,i)=>({...base,id:`${workspace.id}-review-${i}`,merchantRaw:`Cafe ${i}`,reviewStatus:"pending_review" as const}))});
  await db.transaction.createMany({data:Array.from({length:250},(_,i)=>({...base,id:`${workspace.id}-clean-${i}`,merchantRaw:`Merchant ${i}`,categoryConfidence:100,reviewStatus:"confirmed" as const}))});
  const {GET}=await import("../app/api/transactions/route");
  const {POST}=await import("../app/api/transactions/review/route");
  const {assertTrustedRequestOrigin}=await import("../lib/request-security");
  const {withMobileRequestContext}=await import("../lib/mobile-request-context");
  const get=async(page:number,review=true)=>{
   const response=await GET(new Request(`https://clover.test/api/transactions?workspaceId=${workspace.id}&summaryMode=rows&pageSize=30&page=${page}${review ? "&reviewFilter=pending" : ""}`));
   assert.equal(response.status,200);return response.json();
  };
  const start=performance.now();
  const first=await get(1),second=await get(2),end=await get(3);
  assert.equal(first.totalCount,57);assert.equal(second.totalCount,57);
  assert.equal(first.transactions.length,30);assert.equal(second.transactions.length,27);assert.equal(end.transactions.length,0);
  const all=[...first.transactions,...second.transactions];
  assert.equal(new Set(all.map(row=>row.id)).size,57,"Every pending row is reachable exactly once");
  assert.equal(first.summary,undefined,"A native row request must not calculate the whole-ledger financial summary");
  assert.equal((await get(1,false)).totalCount,307);
  // Desktop must honor the full Rows selection rather than silently returning
  // the native 30-row batch or the old 25-row default.
  const desktop = async (page: number, size: number) => {
    const response = await GET(new Request(`https://clover.test/api/transactions?workspaceId=${workspace.id}&summaryMode=rows&pageSize=${size}&page=${page}`));
    assert.equal(response.status,200); return response.json();
  };
  for (const size of [25,50,100,200]) {
    const a=await desktop(1,size),b=await desktop(2,size);
    assert.equal(a.pageSize,size); assert.equal(a.transactions.length,size);
    assert.equal(b.transactions.length,Math.min(size,307-size));
    assert(!a.transactions.some(row=>b.transactions.some(other=>other.id===row.id)),"Numbered pages never overlap");
  }
  const previewResponse=await GET(new Request(`https://clover.test/api/transactions?workspaceId=${workspace.id}&summaryMode=rows&pageSize=200&page=2&previewSize=25`));
  assert.equal(previewResponse.status,200);
  const preview=await previewResponse.json(),complete=await desktop(2,200);
  assert.equal(preview.transactions.length,25); assert.equal(preview.pageSize,200);
  assert.deepEqual(preview.transactions.map(row=>row.id),complete.transactions.slice(0,25).map(row=>row.id),"Preview uses the full page offset, never the 25-row offset");
  const lightResponse=await GET(new Request(`https://clover.test/api/transactions?workspaceId=${workspace.id}&summaryMode=light&pageSize=1`));
  assert.equal(lightResponse.status,200); const light=await lightResponse.json();
  assert.equal(light.summary.spending,30700); assert.equal(light.summary.review,57);
  assert(light.summary.firstReviewTransaction,"Warnings remain reachable without scanning/mapping the full ledger");
  const summaryResponse=await GET(new Request(`https://clover.test/api/transactions?workspaceId=${workspace.id}&summaryMode=full&pageSize=1`));
  assert.equal(summaryResponse.status,200);
  const exactSummary=await summaryResponse.json();
  assert.equal(exactSummary.transactions.length,1);
  assert.equal(exactSummary.summary.spending,30700,"A separate one-row summary still covers the entire filtered history");
  const negative=await db.transaction.create({data:{...base,merchantRaw:"Signed amount example",amount:-10,categoryConfidence:100,reviewStatus:"confirmed"}});
  const signedTotals=await GET(new Request(`https://clover.test/api/transactions?workspaceId=${workspace.id}&summaryMode=light&pageSize=1`));
  assert.equal((await signedTotals.json()).summary.spending,30710,"Aggregate totals must sum individual magnitudes, not cancel opposite signed amounts");
  await db.transaction.delete({where:{id:negative.id}});
  const olderUsd=await db.transaction.create({data:{...base,merchantRaw:"Older USD example",date:new Date("1900-01-01T00:00:00Z"),currency:"USD",amount:0,categoryConfidence:100,reviewStatus:"confirmed"}});
  const currencyPage=await get(1,false);
  assert(currencyPage.transactions.every(row=>row.currency==="PHP"));
  assert.deepEqual(currencyPage.currencyCodes,["PHP","USD"],"Currencies absent from the visible page remain available in Filters");
  await db.transaction.delete({where:{id:olderUsd.id}});
  const {mobileHome}=await import("../lib/mobile-home");
  const home=await mobileHome(workspace.id,"PHP","PHP",true);
  assert.equal(home.reviewCount,57,"Home count and filtered list share the same actionable predicate");
  assert(!home.nextSteps.some(step=>step.id==="transactions"),"Review only appears in Things to Review");
  const clean=await db.transaction.findUniqueOrThrow({where:{id:`${workspace.id}-clean-0`}});
  const reviewIds=all.slice(0,2).map(row=>row.id);
  const before=await db.transaction.findMany({where:{id:{in:reviewIds}},orderBy:{id:"asc"}});
  const keep=async(ids:string[])=>{
   const request=new Request(`https://clover.test/api/mobile/v1/transactions/review?workspaceId=${workspace.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,transactionIds:ids})});
   return withMobileRequestContext(user.clerkUserId,request,()=>{assertTrustedRequestOrigin(request);return POST(request);});
  };
  const response=await keep([...reviewIds,clean.id]);assert.equal(response.status,200);
  assert.deepEqual((await response.json()).keptIds.sort(),reviewIds.sort());
  assert.equal(JSON.stringify(await db.transaction.findUnique({where:{id:clean.id}})),JSON.stringify(clean),"A mixed selection must leave confirmed rows byte-for-byte intact");
  const kept=await db.transaction.findMany({where:{id:{in:reviewIds}},orderBy:{id:"asc"}});
  for(let i=0;i<kept.length;i++) {
   assert.equal(kept[i].reviewStatus,"confirmed");assert.equal(kept[i].reviewPriority,"none");assert.equal(kept[i].reviewReasons,null);
   for(const field of ["amount","date","currency","merchantRaw","categoryId","rawPayload"] as const) assert.equal(JSON.stringify(kept[i][field]),JSON.stringify(before[i][field]),`Keep preserves ${field}`);
  }
  assert.equal(await db.auditLog.count({where:{workspaceId:workspace.id,action:"transaction_review_kept"}}),2);
  assert.equal((await get(1)).totalCount,55);
  const foreign=await db.transaction.create({data:{...base,workspaceId:other.id,accountId:otherAccount.id,categoryId:null,merchantRaw:"Foreign Profile"}});
  const unaffectedId=all[2].id,unaffected=await db.transaction.findUnique({where:{id:unaffectedId}});
  assert.equal((await keep([unaffectedId,foreign.id])).status,409);
  assert.equal(JSON.stringify(await db.transaction.findUnique({where:{id:unaffectedId}})),JSON.stringify(unaffected),"An invalid mixed-Profile selection is atomic");
  console.log(`PASS real PostgreSQL: 57-row review pagination, Home/list count parity, mixed bulk Keep, audit, financial preservation and Profile isolation (${Math.round(performance.now()-start)}ms)`);
 } finally {
  [auth,access,cache].forEach((path,i)=>{if(originals[i])require.cache[path]=originals[i];else delete require.cache[path];});
  await db.user.delete({where:{id:user.id}});await db.$disconnect();
 }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
