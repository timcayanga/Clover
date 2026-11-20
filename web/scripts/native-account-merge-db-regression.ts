import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/clover_migration_qa");assert(process.argv.includes("--execute"));
process.env.CLOVER_MOBILE_API_ENABLED="true";
globalThis.fetch=async()=>{throw Error("No external providers during native merge QA");};
const require=createRequire(import.meta.url);
async function main(){
 const {prisma:db}=await import("../lib/prisma");
 const subject=randomUUID();const user=await db.user.create({data:{clerkUserId:subject,email:subject+"@example.invalid",environment:"staging"}});
 const originals=new Map<string,NodeModule|undefined>();
 function stub(module:string,extra:Record<string,unknown>){const path=require.resolve(module),original=require.cache[path];originals.set(path,original);require.cache[path]={id:path,filename:path,loaded:true,exports:{...require(module),...extra}} as NodeModule;}
 stub("@clerk/nextjs/server",{verifyToken:async(token:string)=>{if(token!=="merge-fixture")throw Error("Invalid token");return {sub:subject,sid:"fixture-session",sts:"active"};}});
 stub("../lib/user-environment",{getCurrentUserEnvironment:()=>"staging"});
 stub("../lib/admin-access",{isAdminOnlyUserId:()=>false,isConfiguredAdminEmail:async()=>false,isAssignedAdmin:async()=>false});
 stub("../lib/auth",{isLocalDevHost:async()=>false,requireAuth:async()=>({userId:subject})});
 try{
  const mobile=await import("../app/api/mobile/v1/[...path]/route");
  const w=await db.workspace.create({data:{userId:user.id,name:"Native merge QA"}}),other=await db.workspace.create({data:{userId:user.id,name:"Other Profile"}});
  const source=await db.account.create({data:{workspaceId:w.id,name:"Source",type:"bank",currency:"PHP",source:"manual",balance:"25"}}),target=await db.account.create({data:{workspaceId:w.id,name:"Keep",type:"bank",currency:"PHP",source:"manual",balance:"500"}});
  const mismatch=await db.account.create({data:{workspaceId:w.id,name:"USD",type:"bank",currency:"USD"}}),foreign=await db.account.create({data:{workspaceId:other.id,name:"Other",type:"bank",currency:"PHP"}});
  const transaction=await db.transaction.create({data:{workspaceId:w.id,accountId:source.id,merchantRaw:"Original raw",merchantClean:"Confirmed title",date:new Date("2026-10-01"),amount:"12.50",type:"expense",currency:"PHP",reviewStatus:"confirmed",rawPayload:{original:"retained",items:[{name:"Item",amount:12.5}]}}});
  const send=async(body:unknown,token="merge-fixture")=>{const req=new Request(`https://staging.clover.ph/api/mobile/v1/accounts/${source.id}/merge?workspaceId=${w.id}`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json",cookie:"spoof=ignored"},body:JSON.stringify(body)});const res=await mobile.POST(req,{params:Promise.resolve({path:["accounts",source.id,"merge"]})});return {status:res.status,data:await res.json()};};
  assert.equal((await send({targetAccountId:target.id,confirmed:true},"bad")).status,401);
  for(const body of [{targetAccountId:target.id},{targetAccountId:target.id,confirmed:false},{targetAccountId:source.id,confirmed:true},{targetAccountId:mismatch.id,confirmed:true}])assert.equal((await send(body)).status,400);
  assert.equal((await send({targetAccountId:foreign.id,confirmed:true})).status,404);
  assert.equal((await db.transaction.findUniqueOrThrow({where:{id:transaction.id}})).accountId,source.id);
  const connection=await db.finverseConnection.create({data:{workspaceId:w.id,userId:user.id,stateHash:randomUUID(),stateExpiresAt:new Date(),status:"ready"}});
  const link=await db.finverseAccountLink.create({data:{workspaceId:w.id,connectionId:connection.id,accountId:source.id,externalAccountId:"fixture-bank",rawPayload:{},normalizedPayload:{}}});
  assert.equal((await send({targetAccountId:target.id,confirmed:true})).status,409);
  assert.equal((await db.finverseAccountLink.findUniqueOrThrow({where:{id:link.id}})).accountId,source.id);
  await db.finverseAccountLink.delete({where:{id:link.id}});
  const budget=await db.budget.create({data:{workspaceId:w.id,accountId:source.id,name:"Scoped budget",scope:"account",targetAmount:"100",currency:"PHP"}});
  assert.equal((await send({targetAccountId:target.id,confirmed:true})).status,409);
  assert.equal((await db.budget.findUniqueOrThrow({where:{id:budget.id}})).accountId,source.id);
  await db.budget.delete({where:{id:budget.id}});
  const result=await send({targetAccountId:target.id,confirmed:true});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.account.id,target.id);
  assert.equal(await db.account.findUnique({where:{id:source.id}}),null);const after=await db.transaction.findUniqueOrThrow({where:{id:transaction.id}});assert.equal(after.accountId,target.id);
  for(const key of ["amount","currency","type","reviewStatus","merchantRaw","merchantClean"] as const)assert.equal(String(after[key]),String(transaction[key]));
  assert.deepEqual(after.rawPayload,transaction.rawPayload);assert.equal(+after.date,+transaction.date);assert.equal(String((await db.account.findUniqueOrThrow({where:{id:target.id}})).balance),"500");
  assert.equal((await send({targetAccountId:target.id,confirmed:true})).status,404);assert.equal(await db.transaction.count({where:{id:transaction.id,accountId:target.id}}),1);
  console.log("PASS native merge: verified bearer, explicit confirmation, Profile/currency/type guards, preserved confirmed fields and target balance, linked-bank/budget refusal without mutation, no duplicate replay. Disposable database only.");
 }finally{for(const [path,original]of originals){if(original)require.cache[path]=original;else delete require.cache[path];}await db.workspace.deleteMany({where:{userId:user.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
