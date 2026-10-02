import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const evaluate = (path, require) => { const exports = {}; const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText; vm.runInNewContext(code,{exports,require,Date,Error,console,process:{env:{EXPO_PUBLIC_REVENUECAT_IOS_KEY:'appl_fixture',EXPO_PUBLIC_REVENUECAT_ANDROID_KEY:'goog_fixture'}}}); return exports; };
const catalog=evaluate('../../shared/store-catalog.ts',()=>{}), policy=evaluate('../src/store-change-policy.ts',()=>catalog), presentation=evaluate('../src/store-presentation.ts',()=>{}), plans=evaluate('../../shared/plan-catalog.ts',()=>{});
const items=os=>catalog.STORE_PACKAGES.map(p=>({identifier:p.identifier,product:{identifier:p[os],subscriptionPeriod:p.period,priceString:'₱169.00',currencyCode:'PHP'}}));
const infoFor=(p=null,patch={})=>({originalAppUserId:'user_fixture',requestDate:new Date().toISOString(),entitlements:{active:{}},activeSubscriptions:p?[p.android]:[],subscriptionsByProductIdentifier:p?{[p.android]:{productIdentifier:p.android.split(':')[0],productPlanIdentifier:p.android.split(':')[1],store:'PLAY_STORE',isActive:true,expiresDate:'2027-01-01T00:00:00Z',periodType:'NORMAL',...patch}}:{}});
const statusFor=(tier='free',provider=null)=>({available:true,appUserId:'user_fixture',productIds:catalog.STORE_PACKAGES.flatMap(p=>[p.android,p.ios]),planTier:tier,billingProvider:provider,hasPaidSubscription:Boolean(provider)});
let info=infoFor(),fail=null,purchases=[],configured=false;
const sdk={isConfigured:async()=>configured,configure:()=>{configured=true;},logIn:async()=>{},invalidateCustomerInfoCache:async()=>{},getCustomerInfo:async()=>info,purchasePackage:async(...args)=>{purchases.push(args);if(fail)throw fail;return {customerInfo:info};},STORE_REPLACEMENT_MODE:Object.fromEntries(['WITHOUT_PRORATION','WITH_TIME_PRORATION','DEFERRED'].map(x=>[x,x]))};
const billing=evaluate('../src/store-billing.ts',name=>{
 if(name==='react-native')return {Platform:{OS:'android'}};
 if(name==='react-native-purchases')return sdk;
 if(name.includes('store-catalog'))return catalog;
 if(name.includes('store-change-policy'))return policy;
 if(name.includes('analytics'))return {trackOperation:(_,run)=>run()};
 throw Error(name);
});
for(const current of catalog.STORE_PACKAGES)for(const target of catalog.STORE_PACKAGES){
 info=infoFor(current);purchases=[];const item=items('android').find(i=>i.identifier===target.identifier);
 if(current===target){await assert.rejects(billing.purchaseStorePackage(statusFor(current.tier,'play_store'),item),/already have/);assert.equal(purchases.length,0);continue;}
 const intent=await billing.purchaseStorePackage(statusFor(current.tier,'play_store'),item),same=current.tier===target.tier;
 assert.equal(purchases.length,1);assert.equal(purchases[0][1],null);
 assert.equal(purchases[0][2].oldProductIdentifier,current.android.split(':')[0]);
 assert.equal(purchases[0][2].replacementMode,same?'WITHOUT_PRORATION':target.tier==='premium'?'WITH_TIME_PRORATION':'DEFERRED');
 assert.equal(intent.effect,same?'next-payment':target.tier==='premium'?'immediate':'renewal');
}
const plus=catalog.STORE_PACKAGES.find(p=>p.identifier==='plus_monthly'),pro=catalog.STORE_PACKAGES[0],target=items('android')[0];
for(const [snapshot,status,reason] of [
 [infoFor(plus),statusFor(),/not yet in sync/],
 [infoFor(),statusFor('pro','play_store'),/not yet in sync/],
 [infoFor(plus),statusFor('premium','play_store'),/not yet in sync/],
 [{...infoFor(plus),originalAppUserId:'user_other'},statusFor('pro','play_store'),/different Clover account/],
 [{...infoFor(plus),requestDate:'2020-01-01'},statusFor('pro','play_store'),/out of date/],
 ...['billingIssuesDetectedAt','autoResumeDate','refundedAt'].map(k=>[infoFor(plus,{[k]:'2027-01-01'}),statusFor('pro','play_store'),/Resolve/]),
 [infoFor(plus,{productPlanIdentifier:null}),statusFor('pro','play_store'),/original billing/],
 [infoFor(plus,{productIdentifier:'clover.plus:annual'}),statusFor('pro','play_store'),/billing period/],
 [infoFor(plus,{periodType:'PREPAID'}),statusFor('pro','play_store'),/Resolve/],
 [{...infoFor(plus),subscriptionsByProductIdentifier:{...infoFor(plus).subscriptionsByProductIdentifier,...infoFor(pro).subscriptionsByProductIdentifier}},statusFor('pro','play_store'),/uniquely/],
 [infoFor(plus),statusFor('pro','app_store'),/original store/],
]){info=snapshot;purchases=[];await assert.rejects(billing.purchaseStorePackage(status,target),reason);assert.equal(purchases.length,0);}
info=infoFor();purchases=[];const first=await billing.purchaseStorePackage(statusFor(),target);
assert.equal(first.effect,'immediate');assert.equal(purchases[0][2],null);
assert.match(policy.purchaseFeedback(statusFor('pro','play_store'),first),/awaiting verification/);
assert.match(policy.purchaseFeedback(statusFor('premium','play_store'),first),/Pro access verified/);
assert.equal(policy.purchaseVerified(statusFor('premium'),first),false);
assert.equal(policy.isPurchaseCancelled({code:'1'}),true);
assert.match(policy.storeErrorMessage({code:'20'}),/payment is pending/);
for(const err of [{code:'1'},{code:'20'},{code:'10'}]){fail=err;await assert.rejects(billing.purchaseStorePackage(statusFor(),target));fail=null;await billing.purchaseStorePackage(statusFor(),target);}
info=infoFor(plus);assert.match(await billing.googleStoreManagementUrl(statusFor('pro','play_store')),/sku=clover.plus$/);
info=null;assert.equal(await billing.googleStoreManagementUrl(statusFor('pro','play_store')),'https://play.google.com/store/account/subscriptions?package=ph.clover.app');
await assert.rejects(billing.googleStoreManagementUrl(statusFor('pro','app_store')),/original store/);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function screen({os='android',tier='pro',provider='play_store',purchaseError=null,resultTier=tier,serverError=false,offeringError=false}={}){
 const states=[],refs=[],deps=[];let si=0,ri=0,ei=0,effects=[],alerts=[],calls=[],offersFail=offeringError,syncFail=serverError;const status=statusFor(tier,provider);
 const session={demo:false,data:{entitlement:status},refresh:()=>calls.push('refresh'),request:async(path,options)=>{if(path==='billing/usage')return {};if(options?.method==='POST'){calls.push('verify');if(syncFail)throw Error('offline');return statusFor(resultTier,provider||(resultTier!=='free'?'play_store':null));}return status;}};
 const module=evaluate('../src/settings-plan.tsx',name=>{
  if(name==='react')return {useState:initial=>{const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:v=>{const i=ri++;return refs[i]??={current:v};},useEffect:(fn,values)=>{const i=ei++;if(!deps[i]||!values||values.some((v,j)=>v!==deps[i][j])){deps[i]=values;effects.push(fn);}}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
  if(name==='react-native')return {Platform:{OS:os},Alert:{alert:(...args)=>alerts.push(args)},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Linking:{openURL:async url=>calls.push(url)},useWindowDimensions:()=>({width:390,fontScale:1}),View:'View',ScrollView:'ScrollView',Pressable:'Pressable'};
  if(name==='./session')return {useSession:()=>session};
  if(name==='./store-billing')return {canUseStore:()=>true,loadStorePackages:async()=>{calls.push('offers');if(offersFail)throw Error('network');return items(os);},purchaseStorePackage:async(_,item)=>{calls.push('purchase');if(purchaseError)throw purchaseError;const p=catalog.STORE_PACKAGES.find(p=>p.identifier===item.identifier);return {productId:p[os],tier:p.tier,effect:tier==='premium'&&p.tier==='pro'?'renewal':tier===p.tier?'next-payment':'immediate'};},restoreStorePurchases:async()=>calls.push('restore'),manageAppleStoreSubscription:async()=>calls.push('apple-sheet'),googleStoreManagementUrl:async()=> 'https://play.google.com/manage-fixture'};
  if(name==='./store-change-policy')return policy;
  if(name==='./store-presentation')return presentation;
  if(name.includes('store-catalog'))return catalog;
  if(name.includes('plan-catalog'))return plans;
  if(name.includes('analytics'))return {telemetry(){}};
  if(name==='./ui')return {Body:'Body',Card:'Card',Icon:'Icon',Notice:'Notice',useTheme:()=>({colors:{},styles:{}})};
  if(name==='./recorded-summary')return {tokenUsagePercent:()=> '0%'};
  if(name==='./app-text')return {Text:'Text'};
  return new Proxy({},{get:(_,k)=>k==='__esModule'?true:String(k)});
 });
 let nodes=[];const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='object'&&n?text(n.props?.children):String(n??'');
 function render(){si=ri=ei=0;effects=[];nodes=[];const tree=module.SettingsPlan();const walk=x=>{if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object'){nodes.push(x);walk(x.props?.children);}};walk(tree);effects.forEach(fn=>fn());}
 async function settle(){for(let i=0;i<3;i++){render();await tick();}render();}
 function click(label){const n=nodes.find(n=>n.props?.onPress&&text(n)===label);assert.ok(n,`Missing ${label}`);assert.ok(!n.props.disabled,`Disabled ${label}`);n.props.onPress();}
 return {settle,click,alerts,calls,text:()=>nodes.filter(n=>['Body','Notice'].includes(n.type)).map(text).join('\n'),choose:async i=>{alerts.at(-1)[2][i].onPress();await settle();},recover:()=>{offersFail=syncFail=false;}};
}
let h=screen({resultTier:'premium'});await h.settle();h.click('Switch to Pro →');h.click('Switch to Pro →');assert.equal(h.alerts.length,1);await h.choose(0);assert.match(h.text(),/Pro access verified/);
h=screen();await h.settle();h.click('Switch to Pro →');await h.choose(0);assert.match(h.text(),/awaiting verification/);assert.doesNotMatch(h.text(),/Plus access verified/);h.click('Manage subscription');await h.choose(1);assert.ok(h.calls.includes('https://play.google.com/manage-fixture'));
h=screen({tier:'premium'});await h.settle();h.click('Switch to Plus →');await h.choose(0);assert.match(h.text(),/next renewal/);
h=screen();await h.settle();h.click('Change billing period →');await h.choose(1);assert.match(h.text(),/next billing date/);
for(const error of [{code:'1'},{code:'20'},{code:'10'}]){h=screen({purchaseError:error});await h.settle();h.click('Switch to Pro →');await h.choose(0);if(error.code==='1')assert.equal(h.text(),'');if(error.code==='20')assert.match(h.text(),/payment is pending/);if(error.code!=='1'){assert.throws(()=>h.click('Switch to Pro →'),/Disabled/);h.click('Refresh plan status');await h.settle();}h.click('Switch to Pro →');assert.equal(h.alerts.length,2);}
h=screen({serverError:true,resultTier:'premium'});await h.settle();h.click('Switch to Pro →');await h.choose(0);assert.match(h.text(),/could not be verified/);h.recover();h.click('Refresh plan status');await h.settle();assert.match(h.text(),/Pro access verified/);assert.equal(h.calls.filter(c=>c==='purchase').length,1);
h=screen({offeringError:true});await h.settle();h.recover();h.click('Refresh plan status');await h.settle();h.click('Switch to Pro →');assert.equal(h.alerts.length,1);
for(const options of [{os:'ios'},{os:'android',provider:'app_store'}]){h=screen(options);await h.settle();h.click('Switch to Pro →');assert.equal(h.alerts[0][2].length,1);assert.ok(!h.calls.includes('purchase'));}
h=screen({os:'ios',provider:'app_store'});await h.settle();h.click('Switch to Pro →');await h.choose(1);assert.ok(h.calls.includes('apple-sheet'));assert.ok(h.calls.includes('verify'));
h=screen({provider:null,tier:'premium'});await h.settle();h.click('Switch to Free →');assert.match(h.alerts[0][1],/granted without a store subscription/);
h=screen();await h.settle();h.click('Switch to Free →');await h.choose(1);assert.ok(h.calls.includes('https://play.google.com/manage-fixture'));assert.ok(!h.calls.includes('purchase'));
h=screen();await h.settle();h.click('Restore purchases');await h.settle();assert.ok(h.calls.includes('restore'));assert.ok(h.calls.includes('verify'));
console.log('PASS Google tier/base-plan matrix, ownership and billing guards, replacement bridge, Plan actions, deferred/delayed verification, cancel, restore, cross-store and retries');
