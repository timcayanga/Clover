import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const url=new URL(process.env.DATABASE_URL??'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??'55441');assert.equal(url.pathname,'/clover_migration_qa');assert(process.argv.includes('--execute'));
globalThis.fetch=async()=>{throw Error('External billing providers are disabled for isolated onboarding QA');};
const require=createRequire(import.meta.url);
async function main(){
 const {prisma:db}=await import('../lib/prisma');const saved=new Map<string,NodeModule|undefined>();const stub=(name:string,exports:unknown)=>{const id=require.resolve(name);saved.set(id,require.cache[id]);require.cache[id]={id,filename:id,loaded:true,exports} as NodeModule;};let identity:string|null=null;
 stub('../lib/user-environment',{getCurrentUserEnvironment:()=> 'staging'});stub('../lib/analytics-audience',{getAnalyticsAudience:async()=>({analytics_audience:'test'})});const clerk=require('@clerk/nextjs/server');stub('@clerk/nextjs/server',{...clerk,auth:async()=>({userId:identity})});stub('../lib/user-context',{getOrCreateCurrentUser:async(clerkUserId:string)=>db.user.findUniqueOrThrow({where:{clerkUserId}})});
 const {GET}=await import('../app/api/onboarding/access/route');
 const user=await db.user.create({data:{clerkUserId:'onboarding-'+randomUUID(),email:randomUUID()+'@example.invalid',verified:true,environment:'staging'}});
 const other=await db.user.create({data:{clerkUserId:'onboarding-'+randomUUID(),email:randomUUID()+'@example.invalid',verified:true,environment:'staging'}});
 const workspace=await db.workspace.create({data:{userId:user.id,name:'Onboarding preservation fixture'}});const account=await db.account.create({data:{workspaceId:workspace.id,name:'QA preserved account',type:'bank',currency:'PHP',balance:'9876.54'}});
 await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date('2026-11-01T00:00:00Z'),amount:'123.45',currency:'PHP',type:'expense',merchantRaw:'Confirmed fixture',reviewStatus:'confirmed'}});
 const snapshot=async()=>JSON.stringify({account:await db.account.findUnique({where:{id:account.id}}),transactions:await db.transaction.findMany({where:{workspaceId:workspace.id}})});const before=await snapshot();
 const tier=async()=>{const r=await GET();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store');return(await r.json()).planTier;};
 try{
  assert.equal((await GET()).status,401);identity=user.clerkUserId;assert.equal(await tier(),'free');
  await db.billingSubscription.create({data:{userId:user.id,provider:'paddle',providerSubscriptionId:'fixture-'+randomUUID(),status:'approval_pending',planTier:'premium'}});assert.equal(await tier(),'free','Provider approval without verified active billing cannot unlock banks');
  await db.billingSubscription.update({where:{userId:user.id},data:{status:'active',interval:'monthly',paidThrough:new Date(Date.now()+86400000),planTier:'pro'}});assert.equal(await tier(),'pro');
  await db.billingSubscription.update({where:{userId:user.id},data:{planTier:'premium'}});assert.equal(await tier(),'premium');
  identity=other.clerkUserId;assert.equal(await tier(),'free','Another user cannot inherit the purchaser entitlement');identity=user.clerkUserId;
  await db.billingSubscription.update({where:{userId:user.id},data:{status:'expired',interval:null,paidThrough:new Date(Date.now()-86400000)}});assert.equal(await tier(),'free');
  await db.storeAccess.create({data:{userId:user.id,store:'APP_STORE',productId:'clover.plus.monthly',sandbox:true,verifiedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});assert.equal(await tier(),'pro');
  await db.storeAccess.update({where:{userId:user.id},data:{store:'PLAY_STORE',productId:'clover.pro:monthly'}});assert.equal(await tier(),'premium');
  await db.storeAccess.update({where:{userId:user.id},data:{expiresAt:new Date(Date.now()-86400000)}});assert.equal(await tier(),'free');
  assert.equal(await snapshot(),before,'Plan verification must not alter confirmed transactions or balances');
  assert.equal((await db.user.findUniqueOrThrow({where:{id:user.id}})).onboardingCompletedAt,null,'Buying or checking a plan must not complete onboarding');
  console.log('PASS onboarding access DB/API: unauthenticated guard, approved-but-unpaid stays Free, verified Plus/Pro, user isolation, expiry, Apple/Google products, private responses and exact confirmed-data preservation.');
 }finally{await db.user.deleteMany({where:{id:{in:[user.id,other.id]}}});for(const[id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
