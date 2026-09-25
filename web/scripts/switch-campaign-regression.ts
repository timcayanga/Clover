import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { campaignOpen, occupiesCampaignPlace, applicationStatus, dayMs } from "../../shared/switch-campaign";
import { evidenceMime } from "../lib/switch-evidence";
const now=new Date();
assert.equal(campaignOpen({status:'draft',endsAt:null},now),false);
assert.equal(campaignOpen({status:'active',endsAt:now},now),false);
assert.equal(occupiesCampaignPlace({activatedAt:now,status:'expired',claimBy:null},now),true);
assert.equal(occupiesCampaignPlace({activatedAt:null,status:'approved',claimBy:now},now),false);
assert.equal(applicationStatus({activatedAt:null,status:'approved',claimBy:now,expiresAt:null},now),'claim_expired');
assert.equal(evidenceMime(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
assert.throws(()=>evidenceMime(new TextEncoder().encode('<svg>unsafe</svg>')));
const fixture=`
let apps,grants,events,user,capacity,refreshes,redeemedCount;
export function reset(){ apps=[{id:'a',userId:'u',campaignId:'switch-to-clover-staging',status:'submitted',activatedAt:null,claimBy:null,expiresAt:null}];grants=[];events=[];capacity=1;refreshes=0;redeemedCount=0;user={id:'u',verified:true,environment:'staging',planTier:'free',planTierLocked:false,billingSubscription:null,storeAccess:null,proGrants:grants}; }
export function state(){return {apps,grants,events,user,refreshes,redeemedCount};}
export function setCapacity(v){capacity=v;}
export const getCurrentUserEnvironment=()=> 'staging';
export const refreshProAccess=async()=>{refreshes++;};
export const capturePostHogServerEvent=async()=>{};
export const uploadObject=async()=>{};
export const deleteImportObject=async()=>{};
export const prisma={
 user:{findUniqueOrThrow:async()=>user,findUnique:async()=>({clerkUserId:'clerk-u'})},
 switchCampaign:{findUniqueOrThrow:async()=>({id:'switch-to-clover-staging',capacity,redeemedCount,status:'active',endsAt:null}),update:async()=>{redeemedCount++;}},
 switchApplication:{findUniqueOrThrow:async()=>apps[0],findFirstOrThrow:async()=>apps[0],findMany:async()=>apps,update:async({data})=>Object.assign(apps[0],data)},
 proAccessGrant:{create:async({data})=>{grants.push({...data,revokedAt:null});return data;}},
 switchEvent:{create:async({data})=>{events.push(data);return data;}},growthAudit:{create:async()=>{}}
};
let lock=Promise.resolve();
export function growthTransaction(fn){const task=lock.then(()=>fn(prisma));lock=task.catch(()=>{});return task;}
reset();`;
async function main(){
 const result=await build({stdin:{contents:`export {activateSwitch,reviewSwitch} from './lib/switch-campaign.server'; export {reset,state,setCapacity} from 'fixture';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/^(fixture|\.\/(prisma|growth|user-environment|pro-access|s3|s3-delete|analytics-server))$/},()=>({path:'fixture',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:fixture,loader:'js'}));}}]});
 const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(resolve('package.json')),mod,mod.exports);
 const api=mod.exports as {reset:()=>void;state:()=>{apps:any[];grants:any[];events:any[];user:any;redeemedCount:number};setCapacity:(v:number)=>void;reviewSwitch:(...v:any[])=>Promise<any>;activateSwitch:(id:string)=>Promise<any>};
 await api.reviewSwitch('a','approved','Welcome','owner');
 assert.ok(+api.state().apps[0].claimBy>Date.now()+6*dayMs);
 await Promise.all([api.activateSwitch('u'),api.activateSwitch('u')]);
 assert.equal(api.state().grants.length,1,'concurrent activation grants once');
 assert.equal(api.state().redeemedCount,1,'lifetime redemption survives user erasure');
 assert.equal(api.state().grants[0].planTier,'pro','stored pro is public Plus');
 assert.equal(+api.state().grants[0].endsAt-+api.state().grants[0].startsAt,30*dayMs);
 assert.equal(api.state().events.filter(e=>e.kind==='activated').length,1);
 await assert.rejects(()=>api.reviewSwitch('a','rejected','Late rejection','owner'));
 api.reset();api.setCapacity(0);await assert.rejects(()=>api.reviewSwitch('a','approved','Welcome','owner'),/No places/);
 api.reset();api.state().user.verified=false;await assert.rejects(()=>api.reviewSwitch('a','approved','Welcome','owner'),/Verify/);
 api.reset();api.state().user.billingSubscription={status:'active',interval:'monthly',planTier:'premium',paidThrough:new Date(Date.now()+dayMs)};await assert.rejects(()=>api.reviewSwitch('a','approved','Welcome','owner'),/Free users/);
 api.reset();api.state().apps[0].status='approved';api.state().apps[0].claimBy=new Date(Date.now()-1);await assert.rejects(()=>api.activateSwitch('u'),/not available/);
 api.reset();await api.reviewSwitch('a','needs_information','Please show purchase date','owner');assert.equal(api.state().apps[0].status,'needs_information');assert.equal(api.state().grants.length,0);
 console.log('PASS campaign: capacity, reservation expiry, exact 30 days, concurrent idempotent activation, eligibility, paid exclusion, review transitions and file signatures.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
