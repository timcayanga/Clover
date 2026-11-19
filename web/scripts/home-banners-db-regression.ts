import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const url=new URL(process.env.DATABASE_URL??'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??'55441');assert.equal(url.pathname,'/clover_migration_qa');assert(process.argv.includes('--execute'));
globalThis.fetch=async()=>{throw Error('External services disabled for Home banners QA');};
const require=createRequire(import.meta.url);
async function main(){
 const {prisma:db}=await import('../lib/prisma');
 const saved=new Map<string,NodeModule|undefined>();const stub=(name:string,exports:unknown)=>{const id=require.resolve(name);saved.set(id,require.cache[id]);require.cache[id]={id,filename:id,loaded:true,exports} as NodeModule;};
 let identity:string|null=null,role='owner';const uploaded:Uint8Array[]=[];
 stub('../lib/user-environment',{getCurrentUserEnvironment:()=> 'staging'});
 stub('../lib/analytics-audience',{getAnalyticsAudience:async()=>({analytics_audience:'test'})});
 stub('../lib/s3',{uploadObject:async(_key:string,bytes:Uint8Array)=>{uploaded.push(bytes);}});stub('../lib/s3-delete',{deleteImportObject:async()=>{}});
 stub('../lib/admin',{requireAdminAuth:async(permission='read')=>{if(role==='none'||permission==='operate'&&!['owner','admin'].includes(role))throw Error('FORBIDDEN');return{userId:'fixture-admin',role};}});
 const clerk=require('@clerk/nextjs/server');stub('@clerk/nextjs/server',{...clerk,auth:async()=>({userId:identity})});
 stub('../lib/user-context',{getOrCreateCurrentUser:async(clerkUserId:string)=>db.user.findUniqueOrThrow({where:{clerkUserId}})});
 const {homeBannerConfig,homeBannerSaveSchema,saveHomeBanners,homeBannersForUser,uploadHomeBannerArtwork,HomeBannerConflict}=await import('../lib/home-banners.server');
 const {GET}=await import('../app/api/home-banners/route');
 const adminRoute=await import('../app/api/admin/home-banners/route');
 const {DEFAULT_HOME_BANNERS}=await import('../../shared/home-banners');
 const user=await db.user.create({data:{clerkUserId:'banners-'+randomUUID(),email:randomUUID()+'@example.invalid',verified:true,environment:'staging'}});
 const workspace=await db.workspace.create({data:{userId:user.id,name:'Banner preservation fixture'}});
 const account=await db.account.create({data:{workspaceId:workspace.id,name:'QA account',type:'bank',currency:'PHP',balance:'1234.50'}});
 await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date('2026-11-01T00:00:00Z'),amount:'45.67',currency:'PHP',type:'expense',merchantRaw:'QA confirmed purchase',reviewStatus:'confirmed'}});
 const snapshot=async()=>JSON.stringify({account:await db.account.findUnique({where:{id:account.id}}),transactions:await db.transaction.findMany({where:{workspaceId:workspace.id}})});
 const before=await snapshot();const campaign='switch-to-clover-staging';
 try{
  await db.homeBannerConfig.deleteMany({where:{environment:'staging'}});
  await db.switchCampaign.create({data:{id:campaign,environment:'staging',status:'active'}});
  const initial=await homeBannerConfig();assert.equal(initial.version,0);assert.equal(initial.items.length,2);
  assert.equal((await GET()).status,401);
  identity=user.clerkUserId;let response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).banners.length,2);
  for(const planTier of ['pro','premium'] as const){await db.user.update({where:{id:user.id},data:{planTier,planTierLocked:true}});assert.equal((await homeBannersForUser(user.id)).banners.length,0);}
  await db.user.update({where:{id:user.id},data:{planTier:'free',planTierLocked:false}});
  const grant=await db.proAccessGrant.create({data:{userId:user.id,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+60000),reason:'QA complimentary access',actorId:'fixture-admin'}});assert.equal((await homeBannersForUser(user.id)).banners.length,0,'Complimentary Plus also hides Free banners');await db.proAccessGrant.delete({where:{id:grant.id}});
  await db.switchCampaign.update({where:{id:campaign},data:{status:'paused'}});assert.equal((await homeBannersForUser(user.id)).banners.length,1);await db.switchCampaign.update({where:{id:campaign},data:{status:'active'}});
  const items=DEFAULT_HOME_BANNERS.map(item=>({...item})).reverse();const changed=homeBannerSaveSchema.parse({version:0,items});
  const result=await saveHomeBanners(changed,'fixture-admin');assert.equal(result.version,1);assert.equal((await homeBannersForUser(user.id)).banners[0].id,'switch-to-clover');
  await assert.rejects(()=>saveHomeBanners(changed,'fixture-admin'),HomeBannerConflict);
  const parallel=await Promise.allSettled([saveHomeBanners({...changed,version:1},'fixture-admin'),saveHomeBanners({...changed,version:1},'fixture-admin')]);assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1,'Only one stale-version race can commit');
  assert.equal(await db.growthAudit.count({where:{targetId:'home-banners:staging',actorId:'fixture-admin'}}),2);
  assert(!homeBannerSaveSchema.safeParse({version:0,items:[{...items[0],href:'https://evil.invalid'}]}).success);
  assert(!homeBannerSaveSchema.safeParse({version:0,items:[{...items[0],href:'/settings/plan'}]}).success,'Campaign purpose cannot link to checkout instead of the form');
  assert(!homeBannerSaveSchema.safeParse({version:0,items:[items[0],items[0]]}).success);
  role='read_only';assert.equal((await (await adminRoute.GET()).json()).editable,false);assert.equal((await adminRoute.POST(new Request('https://clover.test/api/admin/home-banners',{method:'POST',headers:{Origin:'https://clover.test','Content-Type':'application/json'},body:JSON.stringify(changed)}))).status,403);role='owner';
  assert.equal((await adminRoute.POST(new Request('https://clover.test/api/admin/home-banners',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify(changed)}))).status,403);
  const foreign=await db.homeBannerAsset.create({data:{environment:'production',storageKey:'qa-foreign-'+randomUUID(),width:1200,height:600}});
  await assert.rejects(()=>saveHomeBanners({version:2,items:[{...items[0],assetId:foreign.id}]},'fixture-admin'),/this environment/);await db.homeBannerAsset.delete({where:{id:foreign.id}});
  const png=await sharp({create:{width:1200,height:600,channels:3,background:'#a3ebe5'}}).png().toBuffer();const asset=await uploadHomeBannerArtwork(new File([new Uint8Array(png)],'banner.png',{type:'image/png'}));assert.equal(asset.environment,'staging');assert.equal(asset.width,1200);assert.equal(uploaded.length,1);assert.equal((await sharp(uploaded[0]).metadata()).format,'webp');
  const square=await sharp({create:{width:600,height:600,channels:3,background:'#a3ebe5'}}).png().toBuffer();await assert.rejects(()=>uploadHomeBannerArtwork(new File([new Uint8Array(square)],'square.png',{type:'image/png'})),/2:1/);
  await assert.rejects(()=>uploadHomeBannerArtwork(new File(['<svg width="1200" height="600"></svg>'],'fake.png',{type:'image/png'})),/genuine|unsupported|corrupt|no elements/);
  const published=await saveHomeBanners({version:2,items:[{...items[0],assetId:asset.id}]},'fixture-admin');assert.equal(published.version,3);assert.equal((await homeBannersForUser(user.id)).banners[0].imageUrl,`/api/home-banners/assets/${asset.id}`);
  const sql=readFileSync(new URL('../prisma/migrations/20261119130000_free_home_banners/migration.sql',import.meta.url),'utf8');assert(!/UPDATE\s+"(?:Account|Transaction|User)"|DELETE\s+FROM/i.test(sql));
  assert.equal(await snapshot(),before,'Banner configuration, reads and uploads preserve confirmed rows and balances byte-for-byte');
  console.log('PASS Home banners database/API: effective paid/complimentary exclusion, Free visibility, campaign pause, stable reorder, stale-save race, role/origin protection, isolated assets, genuine artwork sizing/encoding and confirmed-record preservation.');
 }finally{
  await db.homeBannerConfig.deleteMany({where:{environment:'staging'}});await db.homeBannerAsset.deleteMany({where:{storageKey:{startsWith:'home-banner-artwork/staging/'}}});await db.growthAudit.deleteMany({where:{actorId:'fixture-admin',targetId:'home-banners:staging'}});await db.switchCampaign.deleteMany({where:{id:campaign}});await db.user.delete({where:{id:user.id}});
  for(const[id,value]of saved){if(value)require.cache[id]=value;else delete require.cache[id];}await db.$disconnect();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
