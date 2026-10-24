import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { calculateProAccess, type AccessInput } from '../lib/pro-access-rules';
import { signupTrialEligible, trialActive, trialMilestone, trialSnapshot, TRIAL_DAY_MS, TRIAL_DURATION_MS } from '../../shared/signup-trial';
import { signupTrialEmail, signupTrialNotice, retryableTrialMailFailure } from '../lib/signup-trial-notices';
const start = new Date('2026-10-24T12:34:56.789Z');
const trial = { startsAt: start, endsAt: new Date(+start + TRIAL_DURATION_MS), revokedAt: null };
assert.equal(signupTrialEligible(new Date(+start-1),start),false);
assert.equal(signupTrialEligible(start,start,start),true);
assert.equal(signupTrialEligible(new Date(+start+1),start,start),false);
assert.equal(signupTrialEligible(null,start),false);
assert.equal(trialActive(trial,new Date(+trial.endsAt-1)),true);
assert.equal(trialActive(trial,trial.endsAt),false);
assert.equal(trialActive({...trial,revokedAt:start},start),false);
const base: AccessInput = { planTier:'free',planTierLocked:false,subscription:null,grants:[{...trial,planTier:'pro',source:'signup_trial'}] };
for (const offset of [0,1,14,29]) {
  const access = calculateProAccess(base,new Date(+start+offset*TRIAL_DAY_MS));
  assert.equal(access.planTier,'pro');assert.equal(access.source,'trial');assert.equal(access.hasPaidSubscription,false);assert.equal(+access.accessEndsAt!,+trial.endsAt);
}
assert.equal(calculateProAccess(base,trial.endsAt).planTier,'free');
for (const status of ['approval_pending','unknown','expired','cancelled']) {
  assert.equal(calculateProAccess({...base,subscription:{status,interval:null,paidThrough:null}},start).source,'trial','No verified payment evidence means original trial continues');
}
const paidEnd = new Date(+start+5*TRIAL_DAY_MS);
for (const tier of ['pro','premium'] as const) {
  const paid = {...base,subscription:{status:'cancelled',planTier:tier,interval:'monthly',paidThrough:paidEnd}};
  assert.equal(calculateProAccess(paid,start).planTier,tier);
  assert.equal(calculateProAccess(paid,start).hasPaidSubscription,true);
  assert.equal(calculateProAccess(paid,paidEnd).source,'trial','End of paid period restores only remaining original trial');
  assert.equal(calculateProAccess(paid,trial.endsAt).planTier,'free');
}
const store = {...base,storeAccess:{productId:'clover.pro.monthly',planTier:'premium' as const,expiresAt:paidEnd,renewing:false}};
assert.equal(calculateProAccess(store,start).planTier,'premium');assert.equal(calculateProAccess(store,paidEnd).planTier,'pro');
const longer = new Date(+trial.endsAt+20*TRIAL_DAY_MS);
assert.equal(calculateProAccess({...base,storeAccess:{planTier:'pro',expiresAt:longer,renewing:false}},trial.endsAt).planTier,'pro');
assert.equal(calculateProAccess({...base,grants:[...base.grants,{startsAt:start,endsAt:longer,planTier:'premium',revokedAt:null,source:'admin'}]},trial.endsAt).planTier,'premium');
assert.equal(calculateProAccess({...base,subscription:{status:'suspended',interval:null,paidThrough:null}},start).planTier,'free','Suspension cannot fall back to trial');
assert.equal(calculateProAccess({...base,grants:base.grants.map(g=>({...g,revokedAt:start}))},start).planTier,'free');
assert.equal(trialSnapshot(trial,false,'pro',start)!.remainingDays,30);
assert.equal(trialSnapshot(trial,true,'pro',start)!.relyingOnTrial,false);
for (const [days, expected] of [[8,null],[7,'seven_days'],[6,null],[1,'one_day'],[0,'expired'],[-1,null]] as const) assert.equal(trialMilestone(trial,new Date(+trial.endsAt-days*TRIAL_DAY_MS)),expected);
assert.equal(trialMilestone({...trial,revokedAt:start},start),null);
const ended = signupTrialNotice({id:'t',endsAt:trial.endsAt},'expired','free');
assert.match(ended.message,/disconnection is being processed/);assert.match(ended.message,/history.*stay available/);
assert.doesNotMatch(signupTrialNotice({id:'t',endsAt:trial.endsAt},'expired','pro').message,/current plan is Clover Free|syncing has stopped/);
const email = signupTrialEmail('<unsafe>', 'A & B <script>', 'https://clover.ph/settings?section=plan');
assert.match(email.html,/&lt;unsafe&gt;/);assert.doesNotMatch(email.html,/<script>/);assert.match(email.text,/Notification preferences/);assert.match(email.html,/viewport/);assert.match(email.text,/\/privacy-policy/);
assert(retryableTrialMailFailure({responseCode:421}));assert(retryableTrialMailFailure({code:'ECONNREFUSED'}));assert(!retryableTrialMailFailure({code:'ETIMEDOUT',command:'DATA'}));

async function deliveryChecks() {
 const fixture = `
import { defaultNotificationTemplates } from '${resolve('lib/notification-template-rules.ts')}';
let trial,access,rows,sends,mode,emailAllowed;
export function reset(options={}) {const now=Date.now();trial={id:'t',userId:'u',startsAt:new Date(now-23*864e5),endsAt:new Date(now+7*864e5-1000),revokedAt:null,user:{environment:'production',verified:true,email:'trial-fixture@example.invalid'}};access={hasPaidSubscription:false,planTier:'pro'};rows=[];sends=[];mode='ok';emailAllowed=true;if(options.paid)access.hasPaidSubscription=true;if(options.expired){trial.endsAt=new Date(now-1000);access.planTier=options.otherGrant?'pro':'free';}if(options.disabled)emailAllowed=false;}
export function state(){return {rows,sends};}
export function setMode(v){mode=v;}
export function retryNow(){for(const row of rows)row.retryAt=new Date(0);}
export const getProAccess=async()=>access;
export const refreshProAccess=async()=>access.planTier;
export const getCurrentUserEnvironment=()=> 'production';
export const getAppPreferences=async()=>({notifications:{email:emailAllowed,inApp:true}});
export const loadRuntimeNotificationTemplates=async()=>defaultNotificationTemplates;
export const sendNotificationMail=async(...args)=>{sends.push(args);if(mode==='transient')throw {responseCode:421};if(mode==='ambiguous')throw {code:'ETIMEDOUT',command:'DATA'};};
export const prisma={ signupTrial:{findUnique:async()=>trial}, notificationEmailDelivery:{
 upsert:async({create})=>{let row=rows.find(r=>r.eventKey===create.eventKey);if(!row){row={...create,id:'d'+rows.length,attempts:0,leaseUntil:null,retryAt:null};rows.push(row);}return structuredClone(row);},
 updateMany:async({where,data})=>{const row=rows.find(r=>r.id===where.id&&(!where.status||r.status===where.status)&&(where.attempts===undefined||r.attempts===where.attempts)&&(!where.leaseUntil||+r.leaseUntil===+where.leaseUntil));if(!row)return {count:0};Object.assign(row,{...data,attempts:data.attempts?row.attempts+data.attempts.increment:row.attempts});return {count:1};}
}};
reset();`;
 const bundled=await build({stdin:{contents:`export {deliverTrialNotice} from './lib/signup-trial-lifecycle';export {reset,state,setMode,retryNow} from 'fixture';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'trial-delivery',setup(b){b.onResolve({filter:/^(fixture|\.\/(prisma|pro-access|user-environment|app-preferences|notification-templates.server|notification-mail.server))$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fixture,loader:'ts',resolveDir:process.cwd()}));}}]});
 const require=createRequire(resolve('package.json')),Module=require('node:module'),mod=new Module(resolve('trial-delivery.cjs'));mod.filename=resolve('trial-delivery.cjs');mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(bundled.outputFiles[0].text,mod.filename);const api=mod.exports;
 const old=process.env.ZOHO_SMTP_PASSWORD;process.env.ZOHO_SMTP_PASSWORD='fixture-not-a-real-secret';
 try {
  api.reset();await Promise.all(Array.from({length:8},()=>api.deliverTrialNotice('u')));assert.equal(api.state().sends.length,1);assert.equal(api.state().rows[0].status,'accepted');await api.deliverTrialNotice('u');assert.equal(api.state().sends.length,1);
  api.reset({paid:true});await api.deliverTrialNotice('u');assert.equal(api.state().sends.length,0);assert.equal(api.state().rows[0].status,'skipped');
  api.reset({disabled:true});await api.deliverTrialNotice('u');assert.equal(api.state().sends.length,0);
  api.reset();api.setMode('transient');await api.deliverTrialNotice('u');assert.equal(api.state().rows[0].status,'failed');await api.deliverTrialNotice('u');assert.equal(api.state().sends.length,1);api.retryNow();api.setMode('ok');await api.deliverTrialNotice('u');assert.equal(api.state().rows[0].status,'accepted');assert.equal(api.state().rows[0].attempts,2);
  api.reset();api.setMode('ambiguous');await api.deliverTrialNotice('u');assert.equal(api.state().rows[0].status,'uncertain');api.retryNow();api.setMode('ok');await api.deliverTrialNotice('u');assert.equal(api.state().sends.length,1,'Ambiguous SMTP acceptance is not blindly retried');
  api.reset({expired:true,otherGrant:true});await api.deliverTrialNotice('u');assert.match(api.state().sends[0][2],/current plan is Clover Plus/);assert.doesNotMatch(api.state().sends[0][2],/syncing has stopped/);
 } finally {if(old===undefined)delete process.env.ZOHO_SMTP_PASSWORD;else process.env.ZOHO_SMTP_PASSWORD=old;}
}
void deliveryChecks().then(() => console.log('Signup trial: entitlement precedence, exact expiry, original remaining trial, paid-through cancellation, fraud revocation, reminder windows, preference suppression, parallel dedupe, definitive failure retries, ambiguous-send protection and branded text/HTML passed.')).catch(error => { console.error(error); process.exitCode=1; });
