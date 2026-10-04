import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const calls=[];
const platform={OS:'ios'};
let configured=false, fail=false, appUserId=null;
const purchases={
  isConfigured:async()=>configured,
  configure:({appUserID})=>{configured=true;appUserId=appUserID;calls.push('configure');},
  getAppUserID:async()=>appUserId,
  logIn:async id=>{appUserId=id;calls.push('identify');},
  showManageSubscriptions:async()=>{calls.push('sheet');if(fail)throw new Error('StoreKit unavailable');},
  invalidateCustomerInfoCache:async()=>calls.push('invalidate'),
};
const exports={};
const code=ts.transpileModule(fs.readFileSync(new URL('../src/store-billing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
vm.runInNewContext(code,{exports,process:{env:{EXPO_PUBLIC_REVENUECAT_IOS_KEY:'appl_fixture',EXPO_PUBLIC_REVENUECAT_ANDROID_KEY:'goog_fixture'}},require:name=>{
  if(name==='react-native')return {Platform:platform};
  if(name==='react-native-purchases')return purchases;
  if(name.includes('store-catalog') || name.includes('store-change-policy'))return {};
  if(name.includes('analytics'))return {trackOperation:(_name,run)=>run()};
  throw new Error(`Unexpected dependency: ${name}`);
}});
const status={available:true,appUserId:'user_fixture',productIds:['plus'],billingProvider:'app_store',hasPaidSubscription:true};
await exports.manageAppleStoreSubscription(status);
assert.deepEqual(calls,['configure','sheet','invalidate']);
calls.length=0;fail=true;
await assert.rejects(exports.manageAppleStoreSubscription(status),/StoreKit unavailable/);
assert.deepEqual(calls,['sheet'],'A failed native presentation must not fall back to the generic production URL');
fail=false;
for(const [os,patch] of [['android',{}],['ios',{billingProvider:'play_store'}],['ios',{hasPaidSubscription:false}]]){
  calls.length=0;platform.OS=os;
  await assert.rejects(exports.manageAppleStoreSubscription({...status,...patch}),/original store/);
  assert.equal(calls.length,0,'Wrong-platform or granted access must not enter Apple billing');
}
platform.OS='ios';calls.length=0;
await exports.manageAppleStoreSubscription(status);
assert.deepEqual(calls,['sheet','invalidate'],'A previous failure must not lock out later management attempts');
console.log('PASS native Apple subscription management: configuration, dismissal invalidation, failure recovery and original-store guards');
